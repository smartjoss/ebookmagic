require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const { OpenAI } = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

// Initialize Supabase Client
let supabase = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY && process.env.SUPABASE_URL !== 'YOUR_SUPABASE_URL_HERE') {
    supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
    console.log('✅ Supabase client initialized');
} else {
    console.warn('⚠️ SUPABASE_URL or KEY is missing. Database features are disabled.');
}

// Initialize OpenAI only if API key is provided
let openai = null;
if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'YOUR_OPENAI_API_KEY_HERE') {
    openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
    });
}

// --- AUTHENTICATION ENDPOINTS ---

// 1. Login
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    if (!supabase) return res.status(500).json({ error: 'Supabase Database is not connected yet.' });

    try {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
             if (error.message.includes('Email not confirmed')) {
                 throw new Error('Email belum dikonfirmasi. Harap konfirmasi email Anda terlebih dahulu.');
             }
             throw error;
        }
        res.json({ success: true, message: 'Login successful!', user: data.user, token: data.session.access_token });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// 2. Register
app.post('/api/auth/register', async (req, res) => {
    const { email, password } = req.body;
    if (!supabase) return res.status(500).json({ error: 'Supabase Database is not connected yet.' });

    try {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) {
            if (error.message.includes('User already registered')) {
                throw new Error('Email ini sudah terdaftar. Silakan gunakan fitur Login.');
            }
            throw error;
        }
        res.json({ 
            success: true, 
            message: 'Registrasi berhasil! Silakan Login.', 
            user: data.user 
        });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// 3. Forgot Password
app.post('/api/auth/reset-password', async (req, res) => {
    const { email } = req.body;
    if (!supabase) return res.status(500).json({ error: 'Supabase Database is not connected yet.' });

    try {
        const { error } = await supabase.auth.resetPasswordForEmail(email);
        if (error) throw error;
        res.json({ success: true, message: 'Tautan reset password telah dikirim ke email Anda!' });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// --- AGENCY & PROFILE ENDPOINTS ---

// 1. Get User Profile
app.get('/api/user/profile', async (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!supabase) return res.status(500).json({ error: 'Database is not connected.' });
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const userSupabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: `Bearer ${token}` } }
        });

        const { data: { user }, error: userError } = await userSupabase.auth.getUser();
        if (userError) throw userError;

        const { data: profile, error: profileError } = await userSupabase
            .from('user_profiles')
            .select('*')
            .eq('id', user.id)
            .single();

        let finalProfile = profile;

        if (profileError || !profile) {
            // Jika belum ada profil (baru daftar), buatkan profil bawaan (personal)
            finalProfile = { role: 'personal', quota_agency: 0, quota_personal: 0 };
            
            // Simpan profil personal ke database secara asinkron
            userSupabase.from('user_profiles').upsert({
                id: user.id,
                role: 'personal',
                quota_agency: 0,
                quota_personal: 0
            }).then();
        }

        res.json({ success: true, profile: finalProfile });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// 2. Get Sub-Users (Agency Dashboard)
app.get('/api/agency/users', async (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];
    if (!supabase) return res.status(500).json({ error: 'Database is not connected.' });

    try {
        const userSupabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: `Bearer ${token}` } }
        });
        
        const { data: { user }, error: userError } = await userSupabase.auth.getUser();
        if (userError) throw userError;

        // Fetch children or all if owner
        const { data: profile } = await userSupabase.from('user_profiles').select('role').eq('id', user.id).single();
        
        let query = userSupabase.from('user_profiles').select('id, email, role, quota_agency, quota_personal, created_at');
        
        if (profile && profile.role === 'owner') {
            // Owner sees everyone except themselves
            query = query.neq('id', user.id);
        } else {
            // Agency/Super Agency sees their children
            query = query.eq('parent_id', user.id);
        }

        const { data, error } = await query;
        if (error) throw error;

        res.json({ success: true, users: data });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// 3. Create Sub-User
app.post('/api/agency/create-user', async (req, res) => {
    const { email, password, newRole } = req.body;
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!supabase) return res.status(500).json({ error: 'Database is not connected.' });

    try {
        const userSupabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: `Bearer ${token}` } }
        });
        const { data: { user }, error: userError } = await userSupabase.auth.getUser();
        if (userError) throw userError;

        // We use a fresh client without persisting session to create the target user
        const adminSupabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
            auth: { persistSession: false }
        });

        const { data: newUserData, error: signUpError } = await adminSupabase.auth.signUp({ email, password });
        if (signUpError) throw signUpError;
        if (!newUserData.user) throw new Error('Failed to create user. Email might be taken.');

        const cost_agency = newRole === 'agency' ? 1 : 0;
        const cost_personal = newRole === 'personal' ? 1 : 0;

        // Call RPC to assign role and deduct quota
        const { error: rpcError } = await userSupabase.rpc('assign_agency_user', {
            creator_id: user.id,
            new_user_id: newUserData.user.id,
            new_role: newRole,
            cost_agency: cost_agency,
            cost_personal: cost_personal
        });

        if (rpcError) throw rpcError;

        res.json({ success: true, message: `User ${email} created successfully as ${newRole}!` });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// 4. Add Quota (Owner Only)
app.post('/api/agency/add-quota', async (req, res) => {
    const { targetUserId, add_agency, add_personal } = req.body;
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!supabase) return res.status(500).json({ error: 'Database is not connected.' });

    try {
        const userSupabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: `Bearer ${token}` } }
        });
        const { data: { user }, error: userError } = await userSupabase.auth.getUser();
        if (userError) throw userError;

        const { data: profile } = await userSupabase.from('user_profiles').select('role').eq('id', user.id).single();
        if (!profile || profile.role !== 'owner') {
            throw new Error('Hanya Owner yang bisa menambah kuota.');
        }

        // Get current quota
        const { data: targetProfile, error: getError } = await userSupabase.from('user_profiles').select('*').eq('id', targetUserId).single();
        if (getError) throw getError;

        const { error: updateError } = await userSupabase.from('user_profiles').update({
            quota_agency: (targetProfile.quota_agency || 0) + (add_agency || 0),
            quota_personal: (targetProfile.quota_personal || 0) + (add_personal || 0)
        }).eq('id', targetUserId);

        if (updateError) throw updateError;

        res.json({ success: true, message: 'Kuota berhasil ditambahkan!' });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// 5. Update Role (Owner Only)
app.post('/api/agency/update-role', async (req, res) => {
    const { targetUserId, newRole } = req.body;
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!supabase) return res.status(500).json({ error: 'Database is not connected.' });

    try {
        const userSupabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: `Bearer ${token}` } }
        });
        const { data: { user }, error: userError } = await userSupabase.auth.getUser();
        if (userError) throw userError;

        const { data: profile } = await userSupabase.from('user_profiles').select('role').eq('id', user.id).single();
        if (!profile || profile.role !== 'owner') {
            throw new Error('Hanya Owner yang bisa mengubah role secara bebas.');
        }

        const { error: updateError } = await userSupabase.from('user_profiles').update({ role: newRole }).eq('id', targetUserId);

        if (updateError) throw updateError;

        res.json({ success: true, message: `Status berhasil diubah menjadi ${newRole}!` });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// --- AI GENERATION ENDPOINTS ---

app.post('/api/generate-titles', async (req, res) => {
    const { niche, audience, apiKey } = req.body;
    const isGemini = apiKey && apiKey.startsWith('AIza');

    // Fallback Mock
    if (!apiKey && !openai) {
        return setTimeout(() => res.json({
            titles: [
                { title: `Rahasia ${niche}`, subtitle: `Cara ampuh untuk ${audience}`, cover_prompt: `A beautiful and minimalist cover for a book about ${niche}, with a focus on ${audience}, high quality, 8k, photorealistic.` },
                { title: `Mastering ${niche}`, subtitle: `Langkah demi langkah untuk pemula`, cover_prompt: `An inspiring vector illustration for an ebook cover about ${niche}, modern, vibrant colors.` },
                { title: `${niche} Blueprint`, subtitle: `Sistem terbukti menghasilkan`, cover_prompt: `A professional corporate ebook cover design representing ${niche}, minimalist graphic, blue and gold colors.` }
            ]
        }), 2000);
    }

    try {
        const prompt = `
        Anda adalah seorang copywriter jenius dan ahli pemasaran digital.
        Tugas Anda adalah membuat 3 ide Judul Ebook yang sangat memikat (mengandung "hook" psikologis) tentang topik: "${niche}", ditargetkan untuk: "${audience}".
        
        Setiap judul harus memiliki:
        1. "title": Judul utama yang bombastis dan bikin penasaran (maks 6 kata). WAJIB menggunakan Bahasa Indonesia.
        2. "subtitle": Subjudul deskriptif yang menjelaskan nilai tambah atau solusi praktis (maks 10 kata). WAJIB menggunakan Bahasa Indonesia.
        3. "cover_prompt": Sebuah prompt bahasa inggris (maks 30 kata) yang sangat deskriptif untuk diumpankan ke AI Image Generator (Midjourney/DALL-E) agar menghasilkan gambar cover/sampul ebook yang visualnya memukau dan relevan dengan judul tersebut.
        
        Jawab HANYA dalam format JSON dengan struktur array:
        [
            {
                "title": "...",
                "subtitle": "...",
                "cover_prompt": "..."
            },
            ...
        ]
        `;

        let data;
        if (isGemini) {
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
            const result = await model.generateContent(prompt);
            let text = result.response.text().replace(/```json/gi, '').replace(/```/g, '').trim();
            data = JSON.parse(text);
        } else {
            let activeOpenai = apiKey ? new OpenAI({ apiKey: apiKey }) : openai;
            const completion = await activeOpenai.chat.completions.create({
                model: "gpt-3.5-turbo",
                messages: [{ role: "user", content: prompt }]
            });
            let text = completion.choices[0].message.content.replace(/```json/gi, '').replace(/```/g, '').trim();
            data = JSON.parse(text);
        }
        
        res.json({ titles: data });
    } catch (error) {
        console.error('Title Generation Error:', error);
        res.status(500).json({ error: 'Kesalahan AI: ' + error.message });
    }
});

app.post('/api/generate-outline', async (req, res) => {
    const { niche, audience, type, apiKey, selectedTitle, selectedSubtitle, authorProfile, cta } = req.body;

    const isGemini = apiKey && apiKey.startsWith('AIza');

    let babCountText = "4-6 Bab";
    if (type === 'panduan') babCountText = "8-12 Bab";
    if (type === 'masterclass') babCountText = "15-20 Bab";

    // Fallback to Mock AI if no key is available
    if (!apiKey && !openai) {
        console.warn('API Key is missing. Using fallback mock data.');
        return setTimeout(() => {
            res.json({
                title: selectedTitle || `Panduan Utama: ${niche || 'Sukses'}`,
                subtitle: selectedSubtitle || `Sistem terbukti untuk ${audience || 'semua orang'}`,
                outline: [
                    "Bab 1: Fondasi Utama",
                    "Bab 2: Strategi Inti",
                    "Bab 3: Teknik Lanjutan",
                    "Bab 4: Implementasi & Tindakan"
                ]
            });
        }, 2000);
    }

    try {
        const titlePrompt = selectedTitle ? `Gunakan judul ini: "${selectedTitle}"` : `Buatlah "title" yang menarik dan viral (maks 6 kata)`;
        const subtitlePrompt = selectedSubtitle ? `Gunakan subjudul ini: "${selectedSubtitle}"` : `Buatlah "subtitle" deskriptif yang menjelaskan nilai tambah`;

        const prompt = `
        Anda adalah seorang ahli pembuat Ebook dan pemasar.
        Buatlah kerangka (outline) ebook yang sangat menarik tentang "${niche}" yang ditargetkan untuk "${audience}".
        Ketebalan Ebook: ${type} (Wajib berisi tepat antara ${babCountText}).
        
        ${authorProfile ? `Instruksi Tambahan (Profil Penulis): Tambahkan 1 bab khusus (misalnya "Tentang Penulis") di awal atau akhir ebook yang menceritakan: ${authorProfile}.` : ''}
        ${cta ? `Instruksi Tambahan (Call to Action): Tambahkan 1 bab khusus di paling akhir ebook (misalnya "Langkah Selanjutnya" atau "Penawaran Spesial") yang mengajak pembaca untuk: ${cta}.` : ''}
        
        Jawab HANYA dalam format JSON dengan struktur berikut (Gunakan Bahasa Indonesia yang baik dan menarik):
        {
            "title": "${titlePrompt}",
            "subtitle": "${subtitlePrompt}",
            "outline": [
                "Kata Pengantar",
                ${authorProfile ? '"Profil Penulis",' : ''}
                "Bab 1: [Nama Bab]",
                "Bab 2: [Nama Bab]",
                "Bab 3: [Nama Bab]",
                ... (Lanjutkan bab sesuai jumlah yang diminta yaitu ${babCountText}),
                "Penutup / Kesimpulan"${cta ? ',\n                "Penawaran Spesial"' : ''}
            ]
        }
        `;

        let data;
        if (isGemini) {
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
            const result = await model.generateContent(prompt);
            let text = result.response.text();
            text = text.replace(/```json/gi, '').replace(/```/g, '').trim();
            data = JSON.parse(text);
        } else {
            let activeOpenai = apiKey ? new OpenAI({ apiKey: apiKey }) : openai;
            const response = await activeOpenai.chat.completions.create({
                model: 'gpt-3.5-turbo',
                messages: [{ role: 'user', content: prompt }],
                response_format: { type: 'json_object' },
                temperature: 0.7
            });
            data = JSON.parse(response.choices[0].message.content);
        }

        res.json(data);
    } catch (error) {
        let errorMsg = error.message;
        
        // Debug available models if it's a 404 model not found
        if (errorMsg.includes('not found') && isGemini) {
            try {
                const modelsRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
                const modelsData = await modelsRes.json();
                const availableModels = modelsData.models ? modelsData.models.map(m => m.name.replace('models/', '')).join(', ') : 'Tidak dapat mengambil list';
                errorMsg += `\n\nModel yang tersedia di akun Anda: ${availableModels}`;
            } catch (e) {
                console.error("Gagal mengambil list model", e);
            }
        }

        console.error('Error generating AI outline:', errorMsg);
        res.status(500).json({ error: 'Kesalahan AI: ' + errorMsg });
    }
});

// API Endpoint for generating chapter content
app.post('/api/generate-chapter', async (req, res) => {
    const { chapterTitle, niche, audience, type, apiKey } = req.body;

    const isGemini = apiKey && apiKey.startsWith('AIza');

    if (!apiKey && !openai) {
        return setTimeout(() => {
            res.json({
                content: `<h3>${chapterTitle}</h3><p>Ini adalah konten simulasi (mock) karena API Key belum dimasukkan. Di aplikasi aslinya, ini akan berisi artikel panjang yang sangat menarik tentang ${niche} untuk ${audience}, lengkap dengan gaya bercerita (storytelling) dan poin-poin penting.</p>`
            });
        }, 3000);
    }

    let chapterLengthInstructions = "Jelaskan konsep utama dengan ringkas, tajam, dan langsung pada intinya (cocok untuk ebook lead magnet pendek).";
    if (type === 'panduan') {
        chapterLengthInstructions = "Jelaskan konsep utama secara komprehensif. Buat beberapa sub-bab, berikan contoh, dan buat paragraf yang lebih panjang.";
    } else if (type === 'masterclass') {
        chapterLengthInstructions = "Bahas materi ini dengan SANGAT MENDETAIL layaknya sebuah ensiklopedia atau buku masterclass premium. Berikan studi kasus mendalam, penjabaran teknis langkah demi langkah, dan buat isi bab ini sangat panjang dan berbobot.";
    }

    try {
        const prompt = `
        Anda adalah seorang penulis bayangan (ghostwriter) dan copywriter ahli.
        Tulislah bab buku yang profesional, menarik, komprehensif, dan persuasif.
        
        Niche/Topik: ${niche}
        Target Pembaca: ${audience}
        Judul Bab: "${chapterTitle}"
        
        Persyaratan Utama (Wajib ditulis dalam BAHASA INDONESIA yang luwes):
        1. Gunakan nada bicara yang komunikatif namun otoritatif (menarik seperti tulisan blogger terkenal).
        2. Masukkan hook bercerita (storytelling) pendek di awal bab.
        3. ${chapterLengthInstructions}
        4. Wajib sertakan poin-poin (bullet points) yang bisa langsung dipraktikkan.
        5. Format tulisan harus menggunakan tag HTML bersih (gunakan <h3>, <h4>, <p>, <ul>, <li>, <strong>, <table>, <tr>, <td> jika diperlukan).
        6. JANGAN membungkus teks dengan blok kode markdown seperti \`\`\`html. Kembalikan HANYA teks HTML mentah.
        `;

        let htmlContent;
        if (isGemini) {
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
            const result = await model.generateContent(prompt);
            htmlContent = result.response.text().replace(/```html/g, '').replace(/```/g, '').trim();
        } else {
            let activeOpenai = apiKey ? new OpenAI({ apiKey: apiKey }) : openai;
            const response = await activeOpenai.chat.completions.create({
                model: 'gpt-3.5-turbo',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.8
            });
            htmlContent = response.choices[0].message.content.trim();
        }

        res.json({ content: htmlContent });
    } catch (error) {
        console.error('Error generating AI chapter:', error.message);
        res.status(500).json({ error: 'Kesalahan AI: ' + error.message });
    }
});

// API Endpoint for generating image prompt
app.post('/api/generate-image-prompt', async (req, res) => {
    const { chapterTitle, niche, apiKey } = req.body;

    const isGemini = apiKey && apiKey.startsWith('AIza');

    if (!apiKey && !openai) {
        return setTimeout(() => {
            res.json({
                prompt: `A highly detailed, photorealistic illustration of ${chapterTitle} related to ${niche}, professional lighting, 8k resolution, cinematic composition`
            });
        }, 1500);
    }

    try {
        const promptText = `
        Anda adalah seorang prompt engineer ahli untuk AI Image Generator (seperti Midjourney, DALL-E).
        Buatlah 1 (satu) buah prompt gambar berbahasa Inggris yang sangat deskriptif dan detail untuk mengilustrasikan bab berjudul "${chapterTitle}" dari sebuah buku tentang "${niche}".
        Prompt harus mencakup subjek utama, gaya visual (misal: photorealistic, 3d render, vector art), pencahayaan, dan resolusi.
        Jangan tambahkan penjelasan apa pun. Cukup kembalikan teks prompt bahasa Inggrisnya saja.
        `;

        let resultPrompt;
        if (isGemini) {
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
            const result = await model.generateContent(promptText);
            resultPrompt = result.response.text().trim();
        } else {
            let activeOpenai = apiKey ? new OpenAI({ apiKey: apiKey }) : openai;
            const response = await activeOpenai.chat.completions.create({
                model: 'gpt-3.5-turbo',
                messages: [{ role: 'user', content: promptText }],
                temperature: 0.7
            });
            resultPrompt = response.choices[0].message.content.trim();
        }

        res.json({ prompt: resultPrompt });
    } catch (error) {
        console.error('Error generating image prompt:', error.message);
        res.status(500).json({ error: 'Kesalahan AI: ' + error.message });
    }
});

// API Endpoint for saving ebook project
app.post('/api/save-ebook', async (req, res) => {
    const { projectId, userId, title, niche, outline, chapters, canvasData, token } = req.body;
    
    if (!supabase) return res.status(500).json({ error: 'Database is not connected.' });

    try {
        // Create an authenticated client to pass RLS
        const userSupabase = token ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: `Bearer ${token}` } }
        }) : supabase;

        if (projectId) {
            const { error } = await userSupabase
                .from('ebooks')
                .update({ 
                    title: title, 
                    niche: niche, 
                    outline: outline, 
                    chapters: chapters, 
                    canvas_data: canvasData,
                    updated_at: new Date().toISOString()
                })
                .eq('id', projectId)
                .eq('user_id', userId);

            if (error) throw error;
            res.json({ success: true, message: 'Project updated successfully!', projectId });
        } else {
            const { data, error } = await userSupabase
                .from('ebooks')
                .insert([{ 
                    user_id: userId, 
                    title: title, 
                    niche: niche, 
                    outline: outline, 
                    chapters: chapters, 
                    canvas_data: canvasData 
                }])
                .select();

            if (error) throw error;
            res.json({ success: true, message: 'Project saved successfully!', projectId: data[0].id });
        }
    } catch (error) {
        console.error('Save Error:', error.message);
        res.status(500).json({ error: 'Failed to save project' });
    }
});

// API Endpoint for getting user's ebooks
app.get('/api/ebooks', async (req, res) => {
    const { userId } = req.query;
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!supabase) return res.status(500).json({ error: 'Database is not connected.' });
    if (!userId) return res.status(400).json({ error: 'User ID is required.' });

    try {
        const userSupabase = token ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: `Bearer ${token}` } }
        }) : supabase;

        const { data, error } = await userSupabase
            .from('ebooks')
            .select('*')
            .eq('user_id', userId)
            .order('updated_at', { ascending: false });

        if (error) throw error;
        res.json({ success: true, ebooks: data });
    } catch (error) {
        console.error('Fetch Error:', error.message);
        res.status(500).json({ error: 'Failed to fetch projects: ' + error.message });
    }
});

app.delete('/api/ebooks/:id', async (req, res) => {
    const { id } = req.params;
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!supabase) return res.status(500).json({ error: 'Database is not connected.' });
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const userSupabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: `Bearer ${token}` } }
        });

        const { error } = await userSupabase
            .from('ebooks')
            .delete()
            .eq('id', id);

        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        console.error('Delete Error:', error.message);
        res.status(500).json({ error: 'Failed to delete project' });
    }
});

app.get('/app', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/app.html'));
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
