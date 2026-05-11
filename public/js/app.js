document.addEventListener('DOMContentLoaded', () => {
    
    // --- AUTHENTICATION LOGIC ---
    const authView = document.getElementById('authView');
    const mainAppContainer = document.getElementById('mainAppContainer');
    
    // Forms
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const forgotForm = document.getElementById('forgotForm');
    
    // Toggles
    const linkShowRegister = document.getElementById('linkShowRegister');
    const linkShowLogin = document.getElementById('linkShowLogin');
    const linkForgotPassword = document.getElementById('linkForgotPassword');
    const linkBackToLogin = document.getElementById('linkBackToLogin');
    
    // Messages & Titles
    const authMessage = document.getElementById('authMessage');
    const authTitle = document.getElementById('authTitle');
    const authSubtitle = document.getElementById('authSubtitle');

    function showMessage(msg, isError = false) {
        authMessage.classList.remove('hidden');
        authMessage.style.backgroundColor = isError ? 'rgba(255, 107, 107, 0.1)' : 'rgba(74, 222, 128, 0.1)';
        authMessage.style.color = isError ? '#ff6b6b' : '#4ade80';
        authMessage.style.border = `1px solid ${isError ? 'rgba(255, 107, 107, 0.3)' : 'rgba(74, 222, 128, 0.3)'}`;
        authMessage.innerText = msg;
    }

    // Check Auto-login
    const savedUser = localStorage.getItem('ebookMagicUser');
    if (savedUser) {
        try {
            window.currentUser = JSON.parse(savedUser);
            authView.style.display = 'none';
            mainAppContainer.classList.remove('hidden');
            setTimeout(() => {
                fetchUserProfile();
                if (typeof loadProjects === 'function') loadProjects();
            }, 100);
        } catch(e) {
            console.error('Failed to parse user session', e);
        }
    }
    
    // Logout Handler
    const btnLogout = document.getElementById('btnLogout');
    if (btnLogout) {
        btnLogout.addEventListener('click', (e) => {
            e.preventDefault();
            localStorage.removeItem('ebookMagicUser');
            window.location.reload();
        });
    }

    // View Toggling
    linkShowRegister.addEventListener('click', (e) => {
        e.preventDefault();
        loginForm.classList.add('hidden');
        registerForm.classList.remove('hidden');
        authTitle.innerText = 'Create Account';
        authSubtitle.innerText = 'Start your journey with us';
        authMessage.classList.add('hidden');
    });

    // Warn user before closing/refreshing
    window.addEventListener('beforeunload', (e) => {
        if (window.currentOutlineData || window.currentProjectId) {
            e.preventDefault();
            e.returnValue = 'Anda memiliki proyek yang mungkin belum tersimpan. Yakin ingin keluar?';
            return e.returnValue;
        }
    });

    linkShowLogin.addEventListener('click', (e) => {
        e.preventDefault();
        registerForm.classList.add('hidden');
        loginForm.classList.remove('hidden');
        authTitle.innerText = 'Welcome Back';
        authSubtitle.innerText = 'Log in to your account';
        authMessage.classList.add('hidden');
    });

    linkForgotPassword.addEventListener('click', (e) => {
        e.preventDefault();
        loginForm.classList.add('hidden');
        forgotForm.classList.remove('hidden');
        authTitle.innerText = 'Reset Password';
        authSubtitle.innerText = 'We will send you a reset link';
        authMessage.classList.add('hidden');
    });

    // API Key Feedback
    const inputApiKey = document.getElementById('inputApiKey');
    const apiKeyStatus = document.getElementById('apiKeyStatus');
    if (inputApiKey && apiKeyStatus) {
        const savedApiKey = localStorage.getItem('ebookMagicApiKey');
        if (savedApiKey) {
            window.userApiKey = savedApiKey;
            inputApiKey.value = savedApiKey;
            inputApiKey.type = 'password';
        }

        // Simpan otomatis saat diketik atau dipaste
        inputApiKey.addEventListener('input', (e) => {
            const val = inputApiKey.value.trim();
            if (val.length > 5) {
                window.userApiKey = val;
                localStorage.setItem('ebookMagicApiKey', val);
                apiKeyStatus.style.display = 'inline-block';
                inputApiKey.style.borderColor = '#10B981';
                setTimeout(() => {
                    apiKeyStatus.style.display = 'none';
                    inputApiKey.style.borderColor = '#ddd';
                }, 1500);
            }
        });

        // Toggle visibility
        const btnToggleApiKey = document.getElementById('btnToggleApiKey');
        if (btnToggleApiKey) {
            btnToggleApiKey.addEventListener('click', () => {
                if (inputApiKey.type === 'password') {
                    inputApiKey.type = 'text';
                    btnToggleApiKey.innerHTML = '<i class="ph ph-eye-slash"></i>';
                } else {
                    inputApiKey.type = 'password';
                    btnToggleApiKey.innerHTML = '<i class="ph ph-eye"></i>';
                }
            });
        }
    }

    linkBackToLogin.addEventListener('click', (e) => {
        e.preventDefault();
        forgotForm.classList.add('hidden');
        loginForm.classList.remove('hidden');
        authTitle.innerText = 'Welcome Back';
        authSubtitle.innerText = 'Log in to your account';
        authMessage.classList.add('hidden');
    });

    // 1. Login Handler
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;
        const btn = document.getElementById('btnLoginSubmit');
        
        btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Loading...';
        btn.disabled = true;

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await res.json();

            if (data.success) {
                showMessage(data.message);
                window.currentUser = { ...data.user, token: data.token }; 
                localStorage.setItem('ebookMagicUser', JSON.stringify(window.currentUser)); // Persist session
                fetchUserProfile();
                loadProjects(); 
                setTimeout(() => {
                    authView.style.display = 'none';
                    mainAppContainer.classList.remove('hidden');
                }, 1000);
            } else {
                throw new Error(data.error);
            }
        } catch (err) {
            showMessage(err.message, true);
        } finally {
            btn.innerHTML = 'Sign In';
            btn.disabled = false;
        }
    });

    // 2. Register Handler
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('registerEmail').value;
        const password = document.getElementById('registerPassword').value;
        const btn = document.getElementById('btnRegisterSubmit');
        
        btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Creating...';
        btn.disabled = true;

        try {
            const res = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await res.json();

            if (data.success) {
                showMessage(data.message);
                setTimeout(() => {
                    linkShowLogin.click(); // Auto switch to login view
                    document.getElementById('loginEmail').value = email;
                    document.getElementById('loginPassword').value = '';
                }, 1500);
            } else {
                throw new Error(data.error);
            }
        } catch (err) {
            showMessage(err.message, true);
        } finally {
            btn.innerHTML = 'Create Account';
            btn.disabled = false;
        }
    });

    // 3. Forgot Password Handler
    forgotForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('forgotEmail').value;
        const btn = document.getElementById('btnForgotSubmit');
        
        btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Sending...';
        btn.disabled = true;

        try {
            const res = await fetch('/api/auth/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });
            const data = await res.json();

            if (data.success) {
                showMessage(data.message);
                setTimeout(() => linkBackToLogin.click(), 3000);
            } else {
                throw new Error(data.error);
            }
        } catch (err) {
            showMessage(err.message, true);
        } finally {
            btn.innerHTML = 'Send Reset Link';
            btn.disabled = false;
        }
    });

    // --- LOAD PROJECTS LOGIC ---
    async function loadProjects() {
        const projectsGrid = document.getElementById('projectsGrid');
        if (!projectsGrid) return;

        try {
            const response = await fetch(`/api/ebooks?userId=${window.currentUser.id}`, {
                headers: {
                    'Authorization': `Bearer ${window.currentUser.token || ''}`
                }
            });
            const data = await response.json();

            if (data.error) throw new Error(data.error);

            if (!data.ebooks || data.ebooks.length === 0) {
                projectsGrid.innerHTML = '<p style="grid-column: 1/-1; color: var(--text-secondary); text-align: center; padding: 20px;">No projects found. Click "Create New" to start!</p>';
                const stat = document.getElementById('statTotalEbooks');
                if (stat) stat.innerText = '0';
                return;
            }

            const stat = document.getElementById('statTotalEbooks');
            if (stat) stat.innerText = data.ebooks.length;

            projectsGrid.innerHTML = '';
            data.ebooks.forEach(ebook => {
                const date = new Date(ebook.updated_at).toLocaleDateString();
                const card = document.createElement('div');
                card.className = 'project-card glass';
                let canvasDataObj = ebook.canvas_data;
                if (typeof canvasDataObj === 'string') {
                    try { canvasDataObj = JSON.parse(canvasDataObj); } catch(e) {}
                }

                let coverHtml = `
                    <div class="project-cover" style="background: linear-gradient(135deg, var(--primary), #4FACFE); display:flex; align-items:center; justify-content:center; height: 300px; border-radius: 8px;">
                        <i class="ph ph-book-open" style="font-size: 32px; color: white;"></i>
                    </div>
                `;
                if (canvasDataObj && canvasDataObj.thumbnail) {
                    coverHtml = `
                        <div class="project-cover" style="background-image: url('${canvasDataObj.thumbnail}'); background-size: cover; background-position: top center; border: 1px solid rgba(0,0,0,0.1); height: 300px; border-radius: 8px;">
                        </div>
                    `;
                }

                card.innerHTML = `
                    ${coverHtml}
                    <div class="project-info">
                        <h4>${ebook.title || 'Untitled Ebook'}</h4>
                        <span>Updated ${date}</span>
                    </div>
                `;
                
                // On click, load the project into memory and go to editor
                card.addEventListener('click', () => {
                    window.currentProjectId = ebook.id;
                    window.currentOutlineData = { title: ebook.title, outline: ebook.outline };
                    window.currentNiche = ebook.niche;
                    window.chaptersContent = ebook.chapters || {};
                    window.currentAuthorProfile = ebook.canvas_data ? (ebook.canvas_data.authorProfile || '') : '';
                    window.currentCTA = ebook.canvas_data ? (ebook.canvas_data.cta || '') : '';
                    
                    if (typeof hideAllViews === 'function') {
                        hideAllViews();
                    } else {
                        document.getElementById('dashboardView').classList.add('hidden');
                        const myEbooksView = document.getElementById('myEbooksView');
                        if (myEbooksView) myEbooksView.classList.add('hidden');
                    }
                    
                    const btnProceedToChapters = document.getElementById('btnProceedToChapters');
                    if (btnProceedToChapters) {
                        btnProceedToChapters.click();
                    } else {
                        document.getElementById('chapterWriterView').classList.remove('hidden');
                        document.getElementById('editorView').classList.remove('hidden');
                        initCanvas();
                    }
                    
                    // Load Canvas Data
                    let cData = ebook.canvas_data;
                    if (typeof cData === 'string') {
                        try { cData = JSON.parse(cData); } catch(e) {}
                    }
                    
                    if(cData && Object.keys(cData).length > 0) {
                        if (cData.pages) {
                            canvasPages = cData.pages;
                            currentCanvasPage = cData.currentPage || 0;
                            setTimeout(() => {
                                canvas.loadFromJSON(canvasPages[currentCanvasPage], function() {
                                    canvas.getObjects().forEach(obj => {
                                        if (obj.type === 'textbox') {
                                            obj.setControlsVisibility({ mt: false, mb: false });
                                            if (typeof obj.initDimensions === 'function') obj.initDimensions();
                                        }
                                    });
                                    canvas.renderAll();
                                });
                                updatePageIndicator();
                            }, 100);
                        } else {
                            canvasPages = Array.isArray(cData) ? cData : [JSON.stringify(cData)];
                            currentCanvasPage = 0;
                            setTimeout(() => {
                                canvas.loadFromJSON(canvasPages[0], function() {
                                    canvas.getObjects().forEach(obj => {
                                        if (obj.type === 'textbox') {
                                            obj.setControlsVisibility({ mt: false, mb: false });
                                            if (typeof obj.initDimensions === 'function') obj.initDimensions();
                                        }
                                    });
                                    canvas.renderAll();
                                });
                                updatePageIndicator();
                            }, 100);
                        }
                    } else {
                        canvasPages = [];
                        currentCanvasPage = 0;
                    }
                });

                projectsGrid.appendChild(card);
            });

        } catch (err) {
            console.error(err);
            projectsGrid.innerHTML = `<p style="grid-column: 1/-1; color: #ff6b6b; text-align: center; padding: 20px;">Failed to load projects: ${err.message}</p>`;
        }
    }

    // --- NAVIGATION LOGIC ---
    const dashboardView = document.getElementById('dashboardView');
    const myEbooksView = document.getElementById('myEbooksView');
    const generatorView = document.getElementById('generatorView');
    const chapterWriterView = document.getElementById('chapterWriterView');
    const editorView = document.getElementById('editorView');
    
    const btnCreateNew = document.getElementById('btnCreateNew');
    const btnBack = document.getElementById('btnBack');
    
    // --- SIDEBAR NAVIGATION LOGIC ---
    const navItems = document.querySelectorAll('.nav-item');
    const navDashboard = document.getElementById('navDashboard');
    const navMyEbooks = document.getElementById('navMyEbooks');
    const navGenerator = document.getElementById('navGenerator');
    const navTemplates = document.getElementById('navTemplates');


    function setActiveNav(activeElement) {
        navItems.forEach(item => item.classList.remove('active'));
        if (activeElement) activeElement.classList.add('active');
    }

    function hideAllViews() {
        if(dashboardView) dashboardView.classList.add('hidden');
        if(myEbooksView) myEbooksView.classList.add('hidden');
        if(generatorView) generatorView.classList.add('hidden');
        if(chapterWriterView) chapterWriterView.classList.add('hidden');
        if(editorView) editorView.classList.add('hidden');
        const templatesView = document.getElementById('templatesView');
        if(templatesView) templatesView.classList.add('hidden');
        const agencyView = document.getElementById('agencyView');
        if(agencyView) agencyView.classList.add('hidden');
    }

    navDashboard.addEventListener('click', (e) => {
        e.preventDefault();
        setActiveNav(navDashboard);
        hideAllViews();
        dashboardView.classList.remove('hidden');
        loadProjects(); // refresh projects
    });

    navMyEbooks.addEventListener('click', (e) => {
        e.preventDefault();
        setActiveNav(navMyEbooks);
        hideAllViews();
        if(myEbooksView) myEbooksView.classList.remove('hidden'); 
        loadProjects();
    });

    navGenerator.addEventListener('click', (e) => {
        e.preventDefault();
        setActiveNav(navGenerator);
        hideAllViews();
        generatorView.classList.remove('hidden');
    });

    const TEMPLATES_DATA = [
        { id: 'modern', name: 'Modern Minimalist', bg: '#ffffff', textColor: '#111827', accent: '#6C63FF', icon: 'ph-leaf', font: "'Outfit', sans-serif" },
        { id: 'dark', name: 'Dark Mode Ebook', bg: '#1F2937', textColor: '#F9FAFB', accent: '#3B82F6', icon: 'ph-moon', font: "'Inter', sans-serif" },
        { id: 'islamic', name: 'Islamic Green', bg: '#ECFDF5', textColor: '#065F46', accent: '#10B981', icon: 'ph-mosque', font: "serif" },
        { id: 'pastel', name: 'Soft Pastel', bg: '#FEF2F2', textColor: '#991B1B', accent: '#F43F5E', icon: 'ph-palette', font: "'Playfair Display', serif" },
        { id: 'corporate', name: 'Corporate Blue', bg: '#EFF6FF', textColor: '#1E3A8A', accent: '#2563EB', icon: 'ph-buildings', font: "'Roboto', sans-serif" },
        { id: 'premium', name: 'Premium Gold', bg: '#111111', textColor: '#FBBF24', accent: '#D97706', icon: 'ph-crown', font: "'Merriweather', serif" }
    ];

    function renderTemplates() {
        const grid = document.getElementById('templatesGrid');
        if(!grid) return;
        grid.innerHTML = '';
        
        TEMPLATES_DATA.forEach(template => {
            const card = document.createElement('div');
            card.className = 'project-card glass';
            card.style.cursor = 'pointer';
            card.innerHTML = `
                <div class="project-cover" style="background: ${template.bg}; display:flex; flex-direction:column; padding: 24px; border: 1px solid rgba(0,0,0,0.1); position: relative; overflow: hidden; box-shadow: inset 0 0 20px rgba(0,0,0,0.05);">
                    <!-- Decorative background shapes -->
                    <div style="position: absolute; top: -20px; right: -20px; width: 120px; height: 120px; border-radius: 50%; background: ${template.accent}; opacity: 0.15;"></div>
                    <div style="position: absolute; bottom: -40px; left: -20px; width: 180px; height: 180px; border-radius: 50%; background: ${template.accent}; opacity: 0.08;"></div>
                    
                    <!-- Cover Content Preview -->
                    <div style="margin-top: 30px; text-align: left; z-index: 1;">
                        <span style="font-size: 11px; color: ${template.accent}; font-weight: 800; text-transform: uppercase; letter-spacing: 2px;">EBOOK TITLE</span>
                        <h3 style="color: ${template.textColor}; font-size: 26px; margin-top: 12px; font-family: ${template.font}; line-height: 1.1; font-weight: 800;">Rahasia Sukses<br>Digital Marketing</h3>
                        <p style="color: ${template.textColor}; opacity: 0.7; font-size: 13px; margin-top: 12px; line-height: 1.4;">Panduan praktis membangun bisnis dari nol tanpa modal besar.</p>
                    </div>
                    
                    <div style="margin-top: auto; display: flex; align-items: center; gap: 10px; z-index: 1;">
                        <i class="ph ${template.icon}" style="font-size: 24px; color: ${template.accent};"></i>
                        <span style="font-size: 12px; color: ${template.textColor}; opacity: 0.9; font-weight: 600;">Nama Penulis</span>
                    </div>
                </div>
                <div class="project-info">
                    <h4 style="color: var(--text-primary); font-size: 16px;">${template.name}</h4>
                    <span style="color: var(--primary); font-weight: 600;">Gunakan Template Ini &rarr;</span>
                </div>
            `;
            
            card.addEventListener('click', () => {
                window.selectedTemplateId = template.id;
                window.selectedTemplateDetails = template;
                alert(`Template '${template.name}' terpilih! Anda akan diarahkan ke Pembuat AI untuk memulai.`);
                document.getElementById('navGenerator').click();
            });
            
            grid.appendChild(card);
        });
    }

    navTemplates.addEventListener('click', (e) => {
        e.preventDefault();
        setActiveNav(navTemplates);
        hideAllViews();
        const templatesView = document.getElementById('templatesView');
        if(templatesView) templatesView.classList.remove('hidden');
        renderTemplates();
    });



    const navAgency = document.getElementById('navAgency');
    if (navAgency) {
        navAgency.addEventListener('click', (e) => {
            e.preventDefault();
            
            // Check role before opening
            if (!window.userProfile || ['free', 'personal'].includes(window.userProfile.role)) {
                alert('Akses Ditolak! Fitur ini khusus untuk akun berstatus Agency, Super Agency, atau Owner. Status Anda saat ini: ' + (window.userProfile ? window.userProfile.role : 'Belum termuat'));
                return;
            }

            setActiveNav(navAgency);
            hideAllViews();
            const agencyView = document.getElementById('agencyView');
            if(agencyView) agencyView.classList.remove('hidden');
            loadAgencyUsers();
        });
    }

    // --- INNER NAVIGATION BUTTONS ---
    btnCreateNew.addEventListener('click', () => {
        window.currentProjectId = null;
        window.currentOutlineData = null;
        window.currentNiche = null;
        window.chaptersContent = {};
        canvasPages = [];
        currentCanvasPage = 0;
        resetGeneratorState();
        setActiveNav(navGenerator);
        hideAllViews();
        generatorView.classList.remove('hidden');
    });

    btnBack.addEventListener('click', () => {
        setActiveNav(navDashboard);
        hideAllViews();
        dashboardView.classList.remove('hidden');
    });

    const btnGenerateOutline = document.getElementById('btnGenerateOutline');
    const outlineResults = document.getElementById('outlineResults');
    const outlineContent = document.getElementById('outlineContent');
    const loadingSkeleton = document.getElementById('loadingSkeleton');

    // Reset generator state
    function resetGeneratorState() {
        outlineResults.classList.add('hidden');
        document.getElementById('inputNiche').value = '';
        document.getElementById('inputAudience').value = '';
    }

    const btnGenerateTitles = document.getElementById('btnGenerateTitles');
    const titleResults = document.getElementById('titleResults');
    const titleOptionsGrid = document.getElementById('titleOptionsGrid');
    const coverPromptBox = document.getElementById('coverPromptBox');
    const coverPromptText = document.getElementById('coverPromptText');
    const btnCopyCoverPrompt = document.getElementById('btnCopyCoverPrompt');
    const step1Form = document.getElementById('step1Form');

    // Title Generation Logic
    if (btnGenerateTitles) {
        btnGenerateTitles.addEventListener('click', async () => {
            const apiKey = document.getElementById('inputApiKey').value;
            const niche = document.getElementById('inputNiche').value;
            const audience = document.getElementById('inputAudience').value;

            if(!apiKey) return alert('Silakan masukkan OpenAI API Key Anda terlebih dahulu.');
            if(!niche || !audience) return alert('Masukkan niche dan audiens.');

            btnGenerateTitles.disabled = true;
            btnGenerateTitles.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Mencari Ide...';

            try {
                window.userApiKey = apiKey;
                localStorage.setItem('ebookMagicApiKey', apiKey);

                const response = await fetch('/api/generate-titles', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ niche, audience, apiKey })
                });

                const data = await response.json();
                if (data.error) throw new Error(data.error);

                titleOptionsGrid.innerHTML = '';
                data.titles.forEach((item, index) => {
                    const card = document.createElement('div');
                    card.className = 'title-option-card';
                    card.style.padding = '15px';
                    card.style.border = '1px solid var(--border)';
                    card.style.borderRadius = '8px';
                    card.style.cursor = 'pointer';
                    card.style.background = 'rgba(0,0,0,0.1)';
                    card.innerHTML = `
                        <div style="display: flex; align-items: flex-start; gap: 10px;">
                            <input type="radio" name="titleSelection" value="${index}" style="margin-top: 4px;">
                            <div>
                                <strong style="color: var(--primary); display: block; font-size: 15px;">${item.title}</strong>
                                <span style="font-size: 12px; color: var(--text-secondary);">${item.subtitle}</span>
                            </div>
                        </div>
                    `;
                    card.addEventListener('click', () => {
                        const radio = card.querySelector('input[type="radio"]');
                        radio.checked = true;
                        
                        // Highlight selected card
                        document.querySelectorAll('.title-option-card').forEach(c => {
                            c.style.borderColor = 'var(--border)';
                            c.style.background = 'rgba(0,0,0,0.1)';
                        });
                        card.style.borderColor = 'var(--primary)';
                        card.style.background = 'rgba(108, 99, 255, 0.05)';

                        // Set global selected title
                        window.selectedEbookTitle = item.title;
                        window.selectedEbookSubtitle = item.subtitle;

                        // Show cover prompt
                        coverPromptText.innerText = item.cover_prompt;
                        coverPromptBox.classList.remove('hidden');

                        // Enable outline generation
                        btnGenerateOutline.disabled = false;
                        btnGenerateOutline.classList.remove('hidden');
                    });
                    titleOptionsGrid.appendChild(card);
                });

                // Add "Original Theme" Option
                const originalCard = document.createElement('div');
                originalCard.className = 'title-option-card';
                originalCard.style.padding = '15px';
                originalCard.style.border = '1px solid var(--border)';
                originalCard.style.borderRadius = '8px';
                originalCard.style.cursor = 'pointer';
                originalCard.style.background = 'rgba(0,0,0,0.1)';
                originalCard.innerHTML = `
                    <div style="display: flex; align-items: flex-start; gap: 10px;">
                        <input type="radio" name="titleSelection" value="original" style="margin-top: 4px;">
                        <div>
                            <strong style="color: #999; display: block; font-size: 15px;">Abaikan, saya ingin menggunakan tema asli saya.</strong>
                            <span style="font-size: 12px; color: var(--text-secondary);">Topik: ${niche}</span>
                        </div>
                    </div>
                `;
                originalCard.addEventListener('click', () => {
                    const radio = originalCard.querySelector('input[type="radio"]');
                    radio.checked = true;
                    
                    document.querySelectorAll('.title-option-card').forEach(c => {
                        c.style.borderColor = 'var(--border)';
                        c.style.background = 'rgba(0,0,0,0.1)';
                    });
                    originalCard.style.borderColor = '#999';
                    originalCard.style.background = 'rgba(255, 255, 255, 0.05)';

                    window.selectedEbookTitle = '';
                    window.selectedEbookSubtitle = '';
                    coverPromptBox.classList.add('hidden');

                    btnGenerateOutline.disabled = false;
                    btnGenerateOutline.classList.remove('hidden');
                });
                titleOptionsGrid.appendChild(originalCard);

                titleResults.classList.remove('hidden');
                step1Form.classList.add('hidden'); // Hide form
            } catch (error) {
                alert(error.message);
            } finally {
                btnGenerateTitles.disabled = false;
                btnGenerateTitles.innerHTML = '<i class="ph ph-lightbulb"></i> Dapatkan Ide Judul Menarik (Hook)';
            }
        });
    }

    if (btnCopyCoverPrompt) {
        btnCopyCoverPrompt.addEventListener('click', () => {
            navigator.clipboard.writeText(coverPromptText.innerText).then(() => {
                const originalIcon = btnCopyCoverPrompt.innerHTML;
                btnCopyCoverPrompt.innerHTML = '<i class="ph ph-check" style="color: green;"></i>';
                setTimeout(() => btnCopyCoverPrompt.innerHTML = originalIcon, 2000);
            });
        });
    }

    // AI Generation Logic (Outline)
    btnGenerateOutline.addEventListener('click', async () => {
        const apiKey = document.getElementById('inputApiKey').value;
        const niche = document.getElementById('inputNiche').value;
        const audience = document.getElementById('inputAudience').value;

        if(!apiKey) {
            alert('Silakan masukkan OpenAI API Key Anda terlebih dahulu.');
            return;
        }

        if(!niche || !audience) {
            alert('Please enter both niche and target audience');
            return;
        }

        // Show loading state
        outlineResults.classList.remove('hidden');
        // Do NOT hide titleResults so user can still see their selected prompt
        btnGenerateOutline.classList.add('hidden'); // Just hide the generate button to avoid double clicks
        
        outlineContent.innerHTML = '';
        loadingSkeleton.classList.remove('hidden');
        
        // Update Stepper to 'Daftar Isi'
        document.querySelectorAll('.wizard-steps .step').forEach((el, index) => {
            if (index === 0) el.classList.remove('active');
            if (index === 1) el.classList.add('active');
        });

        try {
            // Call API
            window.userApiKey = apiKey; // Store globally
            localStorage.setItem('ebookMagicApiKey', apiKey); // Save it

            const type = document.getElementById('inputType') ? document.getElementById('inputType').value : 'praktis';
            const authorProfile = document.getElementById('inputAuthorProfile') ? document.getElementById('inputAuthorProfile').value : '';
            const cta = document.getElementById('inputCTA') ? document.getElementById('inputCTA').value : '';

            window.currentEbookType = type;
            window.currentAuthorProfile = authorProfile;
            window.currentCTA = cta;

            const response = await fetch('/api/generate-outline', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    niche, 
                    audience, 
                    type, 
                    apiKey,
                    selectedTitle: window.selectedEbookTitle,
                    selectedSubtitle: window.selectedEbookSubtitle,
                    authorProfile,
                    cta
                })
            });

            const data = await response.json();
            if (data.error) throw new Error(data.error);
            
            // Hide loading
            loadingSkeleton.classList.add('hidden');
            
            // RESET EDITOR & CANVAS STATE FOR NEW EBOOK
            window.chaptersContent = {};
            if (typeof canvasPages !== 'undefined') {
                canvasPages.length = 0; // Clear array
                currentCanvasPage = 0;
                if (typeof canvas !== 'undefined' && canvas) {
                    canvas.clear();
                }
            }

            // Store globally for chapter writer
            window.currentOutlineData = data;
            window.currentNiche = niche;
            window.currentEbookType = type;
            window.currentAudience = audience;
            
            // Render results
            let html = `
                <div style="margin-bottom: 16px;">
                    <h4 style="color: var(--primary); margin-bottom: 4px;">${data.title}</h4>
                    <p style="color: var(--text-secondary); font-size: 14px;">${data.subtitle}</p>
                </div>
                <ul class="outline-list">
            `;
            
            data.outline.forEach(chapter => {
                html += `
                    <li class="outline-item">
                        <i class="ph ph-check-circle"></i>
                        <span>${chapter}</span>
                    </li>
                `;
            });
            
            html += '</ul>';
            outlineContent.innerHTML = html;

        } catch (error) {
            console.error('Error generating outline:', error);
            outlineContent.innerHTML = `<p style="color: #FF6B6B"><i class="ph-fill ph-warning-circle"></i> ${error.message || 'Gagal membuat daftar isi. Silakan coba lagi.'}</p>`;
            btnGenerateOutline.classList.remove('hidden');
            btnGenerateOutline.disabled = false;
        } finally {
            // Keep button hidden if success, show only if there was an error
        }
    });

    // --- CHAPTER WRITER LOGIC ---
    const btnProceedToChapters = document.getElementById('btnProceedToChapters');
    const btnBackToOutline = document.getElementById('btnBackToOutline');
    const btnProceedToEditor = document.getElementById('btnProceedToEditor');
    const writerOutlineList = document.getElementById('writerOutlineList');
    const currentChapterTitle = document.getElementById('currentChapterTitle');
    const btnGenerateChapterContent = document.getElementById('btnGenerateChapterContent');
    
    let quill;
    let activeChapterElement = null;
    window.chaptersContent = {}; // Store all written chapters

    btnProceedToChapters.addEventListener('click', () => {
        if(!window.currentOutlineData) return alert('Please generate an outline first.');
        generatorView.classList.add('hidden');
        chapterWriterView.classList.remove('hidden');
        editorView.classList.remove('hidden'); // Show Canvas Editor below the Writer
        if (typeof initCanvas === 'function') initCanvas();

        // Initialize Quill if not done yet
        if (!quill) {
            quill = new Quill('#quillEditor', {
                theme: 'snow',
                placeholder: 'Your AI generated content will appear here...',
                modules: {
                    toolbar: [
                        [{ 'header': [1, 2, 3, false] }],
                        ['bold', 'italic', 'underline', 'strike'],
                        [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                        [{ 'align': [] }],
                        [{ 'indent': '-1'}, { 'indent': '+1' }],
                        ['link', 'image'],
                        ['clean']
                    ]
                }
            });
        }

        // Populate Sidebar
        writerOutlineList.innerHTML = '';
        window.currentOutlineData.outline.forEach((chapter, index) => {
            const li = document.createElement('li');
            li.innerText = chapter;
            if (index === 0) {
                li.classList.add('active');
                activeChapterElement = li;
                currentChapterTitle.innerText = chapter;
                if(window.chaptersContent && window.chaptersContent[chapter]) {
                    quill.clipboard.dangerouslyPasteHTML(window.chaptersContent[chapter]);
                } else {
                    quill.setText('');
                }
            }
            li.addEventListener('click', () => {
                // Save current quill content before switching
                if(activeChapterElement) {
                    window.chaptersContent[activeChapterElement.innerText] = quill.root.innerHTML;
                    activeChapterElement.classList.remove('active');
                }
                
                li.classList.add('active');
                activeChapterElement = li;
                currentChapterTitle.innerText = chapter;
                
                // Load saved content if exists
                if(window.chaptersContent[chapter]) {
                    quill.clipboard.dangerouslyPasteHTML(window.chaptersContent[chapter]);
                } else {
                    quill.setText('');
                }
            });
            writerOutlineList.appendChild(li);
        });
    });

    btnBackToOutline.addEventListener('click', () => {
        chapterWriterView.classList.add('hidden');
        generatorView.classList.remove('hidden');
    });

    btnGenerateChapterContent.addEventListener('click', async () => {
        if(!activeChapterElement) return;
        const chapterTitle = activeChapterElement.innerText;
        
        btnGenerateChapterContent.disabled = true;
        btnGenerateChapterContent.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Writing...';
        quill.setText('AI is writing your chapter. This might take a few seconds...\n');

        try {
            const response = await fetch('/api/generate-chapter', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    chapterTitle, 
                    niche: window.currentNiche, 
                    audience: window.currentAudience,
                    type: window.currentEbookType || 'praktis',
                    apiKey: window.userApiKey,
                    authorProfile: window.currentAuthorProfile,
                    cta: window.currentCTA
                })
            });

            const data = await response.json();
            if(data.error) throw new Error(data.error);

            // Insert HTML into Quill
            quill.clipboard.dangerouslyPasteHTML(data.content);
            window.chaptersContent[chapterTitle] = data.content; // Save to memory
        } catch(error) {
            console.error(error);
            alert('Gagal: ' + error.message);
        } finally {
            btnGenerateChapterContent.disabled = false;
            btnGenerateChapterContent.innerHTML = '<i class="ph ph-sparkle"></i> Generate Content';
        }
    });

    const btnGenerateImagePrompt = document.getElementById('btnGenerateImagePrompt');
    const imagePromptContainer = document.getElementById('imagePromptContainer');
    const imagePromptText = document.getElementById('imagePromptText');
    const btnCopyPrompt = document.getElementById('btnCopyPrompt');

    if (btnGenerateImagePrompt) {
        btnGenerateImagePrompt.addEventListener('click', async () => {
            if(!activeChapterElement) return;
            const chapterTitle = activeChapterElement.innerText;
            
            btnGenerateImagePrompt.disabled = true;
            btnGenerateImagePrompt.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Generating...';
            imagePromptContainer.classList.remove('hidden');
            imagePromptText.innerText = 'Menghasilkan prompt gambar...';

            try {
                const response = await fetch('/api/generate-image-prompt', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        chapterTitle, 
                        niche: window.currentNiche,
                        apiKey: window.userApiKey 
                    })
                });

                const data = await response.json();
                if(data.error) throw new Error(data.error);

                imagePromptText.innerText = data.prompt;
            } catch(error) {
                console.error(error);
                imagePromptText.innerText = 'Gagal: ' + error.message;
            } finally {
                btnGenerateImagePrompt.disabled = false;
                btnGenerateImagePrompt.innerHTML = '<i class="ph ph-image"></i> Prompt Gambar AI';
            }
        });
    }

    if (btnCopyPrompt) {
        btnCopyPrompt.addEventListener('click', () => {
            navigator.clipboard.writeText(imagePromptText.innerText)
                .then(() => {
                    const originalIcon = btnCopyPrompt.innerHTML;
                    btnCopyPrompt.innerHTML = '<i class="ph ph-check" style="color: green;"></i>';
                    setTimeout(() => btnCopyPrompt.innerHTML = originalIcon, 2000);
                });
        });
    }

    const btnClosePrompt = document.getElementById('btnClosePrompt');
    if (btnClosePrompt) {
        btnClosePrompt.addEventListener('click', () => {
            const container = document.getElementById('imagePromptContainer');
            if (container) container.classList.add('hidden');
        });
    }

    btnProceedToEditor.addEventListener('click', () => {
        // Save current quill content before leaving
        if(activeChapterElement) {
            window.chaptersContent[activeChapterElement.innerText] = quill.root.innerHTML;
        }

        chapterWriterView.classList.add('hidden');
        editorView.classList.remove('hidden');
        initCanvas(); // Initialize Fabric.js Canvas
    });

    // --- EDITOR LOGIC (Fabric.js) ---
    const btnBackToDashboard = document.getElementById('btnBackToDashboard');

    let canvas;
    let canvasPages = [];
    let currentCanvasPage = 0;

    function saveCurrentPage() {
        if (canvas && canvasPages.length > 0) {
            canvasPages[currentCanvasPage] = JSON.stringify(canvas.toJSON());
        }
    }

    function loadPage(index) {
        if (index >= 0 && index < canvasPages.length) {
            saveCurrentPage();
            currentCanvasPage = index;
            canvas.loadFromJSON(canvasPages[currentCanvasPage], function() {
                canvas.getObjects().forEach(obj => {
                    if (typeof obj.initDimensions === 'function') obj.initDimensions();
                    // FORCE ALL TEXTBOXES TO FULL WIDTH TO FIX LEGACY NARROW MARGIN ISSUES
                    if (obj.type === 'textbox') {
                        obj.set({
                            width: 800,
                            left: 0,
                            originX: 'left'
                        });
                        obj.setControlsVisibility({ mt: false, mb: false });
                        obj.initDimensions();
                    }
                });
                canvas.renderAll();
                updatePageIndicator();
            });
        }
    }

    function updatePageIndicator() {
        const indicator = document.getElementById('pageIndicator');
        if (indicator) {
            indicator.innerText = `Halaman ${currentCanvasPage + 1} / ${canvasPages.length}`;
        }
    }

    // Pagination Listeners
    document.getElementById('btnPrevPage')?.addEventListener('click', () => loadPage(currentCanvasPage - 1));
    document.getElementById('btnNextPage')?.addEventListener('click', () => loadPage(currentCanvasPage + 1));
    document.getElementById('btnAddPage')?.addEventListener('click', () => {
        saveCurrentPage();
        canvas.clear();
        canvas.backgroundColor = '#ffffff';
        canvasPages.push(JSON.stringify(canvas.toJSON()));
        currentCanvasPage = canvasPages.length - 1;
        updatePageIndicator();
    });

    function initCanvas() {
        if (!canvas) {
            canvas = new fabric.Canvas('ebookCanvas', {
                backgroundColor: '#ffffff'
            });

            // Global listener to fix non-breaking spaces and recalculate bounds when typing/pasting
            canvas.on('text:changed', function(e) {
                if (e.target && e.target.type === 'textbox') {
                    // Convert non-breaking spaces to normal spaces so wrapping works
                    let text = e.target.text || '';
                    if (text.includes(String.fromCharCode(160))) {
                        e.target.set('text', text.replace(new RegExp(String.fromCharCode(160), 'g'), ' '));
                    }
                    if (typeof e.target.initDimensions === 'function') {
                        e.target.initDimensions();
                    }
                    canvas.renderAll();
                }
            });

            // Update UI when object is selected
            function updateUIFromSelection(e) {
                const activeObject = e.selected ? e.selected[0] : canvas.getActiveObject();
                if (activeObject && activeObject.type === 'textbox') {
                    // Sync font family
                    const fontSelector = document.getElementById('fontFamilySelector');
                    if (fontSelector && activeObject.fontFamily) {
                        const fontOptions = Array.from(fontSelector.options).map(o => o.value);
                        if (fontOptions.includes(activeObject.fontFamily)) {
                            fontSelector.value = activeObject.fontFamily;
                        }
                    }
                    
                    // Sync style (approximation based on size)
                    const styleSelector = document.getElementById('textStyleSelector');
                    if (styleSelector && activeObject.fontSize) {
                        const size = activeObject.fontSize;
                        if (size >= 40) styleSelector.value = 'h1';
                        else if (size >= 30) styleSelector.value = 'h2';
                        else if (size >= 24) styleSelector.value = 'h3';
                        else styleSelector.value = 'normal';
                    }
                    
                    // Sync color
                    const colorPicker = document.getElementById('colorPicker');
                    if (colorPicker && activeObject.fill) {
                        colorPicker.value = activeObject.fill;
                    }
                }
            }
            canvas.on('selection:created', updateUIFromSelection);
            canvas.on('selection:updated', updateUIFromSelection);

            if (canvasPages.length === 0) {
                // Determine template and content
                const template = window.selectedTemplateDetails || TEMPLATES_DATA[0];
                const outline = window.currentOutlineData || { title: 'Judul Ebook Ajaib', subtitle: 'Deskripsi fantastis dari mahakarya Anda' };
                
                // Parse font family correctly for Fabric
                const primaryFont = template.font.replace(/['"]/g, '').split(',')[0].trim();

                // Set canvas background
                canvas.backgroundColor = template.bg;

                // Add decorative accent line
                const shape = new fabric.Rect({
                    left: 800/2 - 50,
                    top: 200,
                    width: 100,
                    height: 6,
                    fill: template.accent,
                    rx: 3,
                    ry: 3
                });

                // Set up Title based on Template
                const titleText = new fabric.Textbox(outline.title, {
                    left: 50,
                    top: 240,
                    width: 495,
                    fontSize: 42,
                    fontFamily: primaryFont,
                    fontWeight: 800,
                    textAlign: 'center',
                    fill: template.textColor,
                    lineHeight: 1.2
                });
                titleText.setControlsVisibility({ mt: false, mb: false });

                // Set up Subtitle based on Template
                const subtitleText = new fabric.Textbox(outline.subtitle, {
                    left: 70,
                    top: 240 + titleText.getScaledHeight() + 30, // Position dynamically below title
                    width: 455,
                    fontSize: 18,
                    fontFamily: primaryFont,
                    textAlign: 'center',
                    fill: template.textColor,
                    opacity: 0.8,
                    lineHeight: 1.5
                });
                subtitleText.setControlsVisibility({ mt: false, mb: false });

                // Add author placeholder at the bottom
                const authorText = new fabric.Textbox('Penulis: ' + (window.currentUser?.user_metadata?.full_name || 'Nama Anda'), {
                    left: 50,
                    top: 750,
                    width: 495,
                    fontSize: 16,
                    fontFamily: primaryFont,
                    fontWeight: 'bold',
                    textAlign: 'center',
                    fill: template.accent
                });
                authorText.setControlsVisibility({ mt: false, mb: false });

                canvas.add(shape, titleText, subtitleText, authorText);
                canvasPages.push(JSON.stringify(canvas.toJSON()));
                currentCanvasPage = 0;
                updatePageIndicator();
            } else {
                loadPage(currentCanvasPage);
            }
        }
    }


    // Back from Editor
    btnBackToDashboard.addEventListener('click', () => {
        editorView.classList.add('hidden');
        dashboardView.classList.remove('hidden');
    });

    // Editor Tools
    document.getElementById('btnAddText').addEventListener('click', () => {
        const text = new fabric.Textbox('Ketik di sini...', {
            left: 0,
            top: 100,
            width: 800, // FULL canvas width, NO limits!
            fontSize: 20,
            fontFamily: 'Outfit',
            fill: document.getElementById('colorPicker').value,
            splitByGrapheme: false
        });
        // Prevent vertical squishing, force wrapping via width handles
        text.setControlsVisibility({
            mt: false, // middle top
            mb: false  // middle bottom
        });
        canvas.add(text);
        canvas.setActiveObject(text);
    });

    ['Left', 'Center', 'Right'].forEach(align => {
        const btn = document.getElementById(`btnAlign${align}`);
        if(btn) {
            btn.addEventListener('click', () => {
                let objects = canvas.getActiveObjects();
                if (objects.length === 0) {
                    objects = canvas.getObjects('textbox');
                }
                
                objects.forEach(obj => {
                    if (obj.type === 'textbox') {
                        obj.set({ textAlign: align.toLowerCase() });
                    }
                });
                canvas.renderAll();
            });
        }
    });

    // Full Width Button (Remove Margins)
    const btnFullWidth = document.getElementById('btnFullWidth');
    if(btnFullWidth) {
        btnFullWidth.addEventListener('click', () => {
            let objects = canvas.getActiveObjects();
            if (objects.length === 0) {
                objects = canvas.getObjects('textbox');
            }
            
            let applied = false;
            objects.forEach(obj => {
                if (obj.type === 'textbox') {
                    // Force the text box to take the entire canvas width
                    const newFontSize = obj.fontSize * (obj.scaleX || 1);
                    obj.set({ 
                        fontSize: newFontSize,
                        scaleX: 1,
                        scaleY: 1,
                        width: 800, // Max canvas width
                        left: 0,    // Start from extreme left edge
                        originX: 'left'
                    });
                    if (typeof obj.initDimensions === 'function') obj.initDimensions();
                    applied = true;
                }
            });
            
            canvas.renderAll();
            
            if (applied) {
                alert('Teks berhasil diatur ke layar penuh dari kiri ke kanan tanpa sisa margin!');
            } else {
                alert('Pilih teksnya dulu, atau tidak ada teks yang bisa diatur layarnya.');
            }
        });
    }

    const imageUploadInput = document.getElementById('imageUploadInput');
    if (imageUploadInput) {
        imageUploadInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function(f) {
                const data = f.target.result;
                fabric.Image.fromURL(data, function(img) {
                    if(img.width > 400) {
                        img.scaleToWidth(400);
                    }
                    img.set({
                        left: 50,
                        top: 50
                    });
                    canvas.add(img);
                    canvas.setActiveObject(img);
                });
            };
            reader.readAsDataURL(file);
            e.target.value = '';
        });
    }

    document.getElementById('btnAddRect').addEventListener('click', () => {
        const rect = new fabric.Rect({
            left: 100,
            top: 100,
            fill: document.getElementById('colorPicker').value,
            width: 100,
            height: 100,
            rx: 10,
            ry: 10
        });
        canvas.add(rect);
        canvas.setActiveObject(rect);
    });

    document.getElementById('btnDeleteObj').addEventListener('click', () => {
        const activeObjects = canvas.getActiveObjects();
        if (activeObjects.length) {
            canvas.discardActiveObject();
            activeObjects.forEach(function(object) {
                canvas.remove(object);
            });
        }
    });

    // Update color of active object
    document.getElementById('colorPicker').addEventListener('input', (e) => {
        const activeObject = canvas.getActiveObject();
        if (activeObject) {
            if (activeObject.type === 'textbox') {
                activeObject.set('fill', e.target.value);
            } else {
                activeObject.set('fill', e.target.value);
            }
            canvas.renderAll();
        }
    });

    // Font Style / Heading Selector
    document.getElementById('textStyleSelector').addEventListener('change', (e) => {
        const activeObject = canvas.getActiveObject();
        if (activeObject && activeObject.type === 'textbox') {
            const val = e.target.value;
            if (val === 'h1') {
                activeObject.set({ fontSize: 42, fontWeight: 800 });
            } else if (val === 'h2') {
                activeObject.set({ fontSize: 32, fontWeight: 700 });
            } else if (val === 'h3') {
                activeObject.set({ fontSize: 24, fontWeight: 600 });
            } else {
                activeObject.set({ fontSize: 18, fontWeight: 'normal' });
            }
            if (typeof activeObject.initDimensions === 'function') activeObject.initDimensions();
            canvas.renderAll();
        }
    });

    // Font Family Selector
    document.getElementById('fontFamilySelector').addEventListener('change', (e) => {
        const activeObject = canvas.getActiveObject();
        if (activeObject && activeObject.type === 'textbox') {
            activeObject.set('fontFamily', e.target.value);
            if (typeof activeObject.initDimensions === 'function') activeObject.initDimensions();
            canvas.renderAll();
        }
    });

    // Keyboard controls for moving objects
    window.addEventListener('keydown', (e) => {
        // Don't interfere if user is typing in an input or quill editor
        if(e.target.tagName.toLowerCase() === 'input' || e.target.tagName.toLowerCase() === 'textarea' || e.target.closest('.ql-editor') || e.target.tagName.toLowerCase() === 'select') return;
        
        const obj = canvas?.getActiveObject();
        if (!obj) return;
        
        // Prevent default scrolling for arrow keys
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
            e.preventDefault();
        }
        
        const step = e.shiftKey ? 10 : 1; // Move faster if holding shift
        if (e.key === 'ArrowUp') { obj.top -= step; canvas.renderAll(); }
        else if (e.key === 'ArrowDown') { obj.top += step; canvas.renderAll(); }
        else if (e.key === 'ArrowLeft') { obj.left -= step; canvas.renderAll(); }
        else if (e.key === 'ArrowRight') { obj.left += step; canvas.renderAll(); }
        else if (e.key === 'Delete' || e.key === 'Backspace') {
            // Only delete if it's not a textbox currently being edited
            if (!obj.isEditing) {
                canvas.remove(obj);
                canvas.discardActiveObject();
                canvas.renderAll();
            }
        }
    });

    // Export PDF Integration
    document.getElementById('btnExportPDF').addEventListener('click', () => {
        const btn = document.getElementById('btnExportPDF');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Exporting...';
        btn.disabled = true;

        // Small timeout to allow UI to update to loading state
        setTimeout(() => {
            const exportPDFAsync = async () => {
                // Deselect active object to avoid printing selection borders
                canvas.discardActiveObject();
                saveCurrentPage();

                const { jsPDF } = window.jspdf;
                const pdf = new jsPDF({
                    orientation: 'portrait',
                    unit: 'px',
                    format: [800, 1131]
                });

                const renderPageToDataURL = (jsonStr) => {
                    return new Promise((resolve) => {
                        canvas.loadFromJSON(jsonStr, () => {
                            canvas.renderAll();
                            resolve(canvas.toDataURL({ format: 'png', multiplier: 2 }));
                        });
                    });
                };

                // 1. Add All Canvas Pages
                for (let i = 0; i < canvasPages.length; i++) {
                    if (i > 0) pdf.addPage();
                    const dataURL = await renderPageToDataURL(canvasPages[i]);
                    pdf.addImage(dataURL, 'PNG', 0, 0, 800, 1131);
                }

                // Helper to strip HTML but preserve structure
                function stripHtml(html) {
                    let formattedHtml = html
                        .replace(/<p[^>]*>/gi, '\n')
                        .replace(/<\/p>/gi, '\n')
                        .replace(/<br\s*[\/]?>/gi, '\n')
                        .replace(/<h[1-6][^>]*>/gi, '\n\n')
                        .replace(/<\/h[1-6]>/gi, '\n')
                        .replace(/<li[^>]*>/gi, '\n• ')
                        .replace(/<\/li>/gi, '')
                        .replace(/<ul[^>]*>/gi, '\n')
                        .replace(/<\/ul>/gi, '\n');
                        
                    let tmp = document.createElement("DIV");
                    tmp.innerHTML = formattedHtml;
                    let text = tmp.textContent || tmp.innerText || "";
                    // Clean up excessive newlines
                    return text.replace(/\n\s*\n\s*\n/g, '\n\n').trim();
                }

                // 2. Add Chapter Pages
                if (window.currentOutlineData && window.currentOutlineData.outline) {
                    // Make sure the last edited chapter is saved
                    if (typeof activeChapterElement !== 'undefined' && activeChapterElement && typeof quill !== 'undefined') {
                        window.chaptersContent[activeChapterElement.innerText] = quill.root.innerHTML;
                    }

                    window.currentOutlineData.outline.forEach((chapterTitle) => {
                        const htmlContent = window.chaptersContent[chapterTitle];
                        if (htmlContent) {
                            pdf.addPage();
                            let yOffset = 60; // Better top margin
                            
                            // Draw Title
                            pdf.setFont("helvetica", "bold");
                            pdf.setFontSize(22);
                            const splitTitle = pdf.splitTextToSize(chapterTitle, 495);
                            pdf.text(splitTitle, 50, yOffset);
                            yOffset += (splitTitle.length * 28) + 30; // Spacing below title

                            // Draw Content
                            pdf.setFont("helvetica", "normal");
                            pdf.setFontSize(12);
                            
                            const plainText = stripHtml(htmlContent);
                            const splitContent = pdf.splitTextToSize(plainText, 495);
                            
                            // Handle page breaks with professional line height
                            for(let i = 0; i < splitContent.length; i++) {
                                if(yOffset > 780) { // Bottom margin safety
                                    pdf.addPage();
                                    yOffset = 60;
                                }
                                pdf.text(splitContent[i], 50, yOffset);
                                yOffset += 18; // 1.5x Line height for readability
                            }
                        }
                    });
                }

                // Save PDF
                pdf.save((window.currentNiche || 'Ebook') + '.pdf');

                // Restore currently viewed canvas page
                loadPage(currentCanvasPage);

                btn.disabled = false;
                btn.innerHTML = originalText;
            };

            exportPDFAsync().catch(err => {
                console.error(err);
                alert('Gagal mengekspor PDF: ' + err.message);
                btn.disabled = false;
                btn.innerHTML = originalText;
            });
        }, 100);
    });

    // --- SAVE PROJECT LOGIC ---
    const btnSaveProject = document.getElementById('btnSaveProject');
    if(btnSaveProject) {
        btnSaveProject.addEventListener('click', async () => {
            if(!window.currentUser) return alert('You must be logged in to save.');
            if(!window.currentOutlineData) return alert('No project data to save.');

            btnSaveProject.disabled = true;
            const originalText = btnSaveProject.innerHTML;
            btnSaveProject.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Saving...';

            if (typeof activeChapterElement !== 'undefined' && activeChapterElement && typeof quill !== 'undefined') {
                window.chaptersContent[activeChapterElement.innerText] = quill.root.innerHTML;
            }

            try {
                // Prepare Data
                if (typeof saveCurrentPage === 'function') saveCurrentPage();
                // Generate thumbnail
                let thumbnailBase64 = null;
                if (typeof canvas !== 'undefined' && canvas) {
                    canvas.discardActiveObject();
                    canvas.renderAll();
                    thumbnailBase64 = canvas.toDataURL({ format: 'jpeg', quality: 0.5, multiplier: 0.5 });
                }

                const payload = {
                    projectId: window.currentProjectId,
                    userId: window.currentUser.id,
                    title: window.currentOutlineData.title || 'Untitled Ebook',
                    niche: window.currentNiche || '',
                    outline: window.currentOutlineData.outline || [],
                    chapters: window.chaptersContent || {},
                    canvasData: {
                        pages: canvasPages,
                        currentPage: currentCanvasPage,
                        thumbnail: thumbnailBase64,
                        authorProfile: window.currentAuthorProfile || '',
                        cta: window.currentCTA || ''
                    },
                    token: window.currentUser.token // Send token for RLS bypass
                };

                const response = await fetch('/api/save-ebook', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                const result = await response.json();
                if(result.error) throw new Error(result.error);
                
                if (result.projectId) {
                    window.currentProjectId = result.projectId;
                }

                alert('✅ ' + result.message);
            } catch(error) {
                console.error(error);
                alert('❌ Failed to save project: ' + error.message);
            } finally {
                btnSaveProject.disabled = false;
                btnSaveProject.innerHTML = originalText;
            }
        });
    }

    // --- AGENCY & PROFILE FUNCTIONS ---
    async function fetchUserProfile() {
        if (!window.currentUser || !window.currentUser.token) return;
        try {
            const res = await fetch('/api/user/profile', {
                headers: { 'Authorization': `Bearer ${window.currentUser.token}` }
            });
            const data = await res.json();
            if (data.success && data.profile) {
                window.userProfile = data.profile;
                
                // Hide Agency tab if NOT allowed (it is visible by default now)
                const role = data.profile.role;
                const navAgency = document.getElementById('navAgency');
                if (['owner', 'super_agency', 'agency'].includes(role)) {
                    if (navAgency) navAgency.classList.remove('hidden');
                } else {
                    if (navAgency) navAgency.classList.add('hidden');
                }
            }
        } catch (err) {
            console.error('Failed to fetch profile', err);
        }
    }

    async function loadAgencyUsers() {
        const roleStatus = document.getElementById('agencyRoleStatus');
        const quotaAgency = document.getElementById('agencyQuotaAgency');
        const quotaPersonal = document.getElementById('agencyQuotaPersonal');
        const tableBody = document.getElementById('agencyUsersTableBody');
        const optRoleAgency = document.getElementById('optRoleAgency');
        const optRoleSuperAgency = document.getElementById('optRoleSuperAgency');
        
        // Update Stats
        if (window.userProfile) {
            const roleName = window.userProfile.role.replace('_', ' ');
            roleStatus.innerText = roleName;
            quotaAgency.innerText = window.userProfile.quota_agency || '0';
            quotaPersonal.innerText = window.userProfile.quota_personal || '0';

            if (window.userProfile.role === 'owner') {
                quotaAgency.innerText = 'Unlimited';
                quotaPersonal.innerText = 'Unlimited';
                if(optRoleAgency) optRoleAgency.classList.remove('hidden');
                if(optRoleSuperAgency) optRoleSuperAgency.classList.remove('hidden');
            } else if (window.userProfile.role === 'super_agency') {
                if(optRoleAgency) optRoleAgency.classList.remove('hidden');
                if(optRoleSuperAgency) optRoleSuperAgency.classList.add('hidden');
            } else if (window.userProfile.role === 'agency') {
                if(optRoleAgency) optRoleAgency.classList.add('hidden');
                if(optRoleSuperAgency) optRoleSuperAgency.classList.add('hidden');
                // Auto select personal
                document.getElementById('agencyNewRole').value = 'personal';
            }
        }

        // Load users
        tableBody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px;"><i class="ph ph-spinner ph-spin"></i> Memuat...</td></tr>';
        
        try {
            const res = await fetch('/api/agency/users', {
                headers: { 'Authorization': `Bearer ${window.currentUser.token}` }
            });
            const data = await res.json();
            
            if (data.error) throw new Error(data.error);

            if (!data.users || data.users.length === 0) {
                tableBody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px; color: var(--text-secondary);">Belum ada klien yang dibuat.</td></tr>';
                return;
            }

            let html = '';
            data.users.forEach(u => {
                const email = u.email ? u.email : 'Belum Ada Email';
                const date = new Date(u.created_at).toLocaleDateString();
                const quotaText = `Agn: ${u.quota_agency || 0} | Prs: ${u.quota_personal || 0}`;
                html += `
                    <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                        <td style="padding: 12px;">${email}</td>
                        <td style="padding: 12px; text-transform: uppercase; font-size: 12px; font-weight: bold; color: var(--primary);">${u.role.replace('_', ' ')}</td>
                        <td style="padding: 12px; font-size: 12px; color: var(--text-secondary);">${quotaText}</td>
                        <td style="padding: 12px;">${date}</td>
                        <td style="padding: 12px;">
                            ${window.userProfile && window.userProfile.role === 'owner' ? 
                                `<button onclick="addQuota('${u.id}')" class="btn-ghost" style="padding:4px 8px; font-size: 11px;">+ Kuota</button>
                                 <button onclick="changeRole('${u.id}', '${u.role}')" class="btn-ghost" style="padding:4px 8px; font-size: 11px; margin-left: 5px;">Ubah Role</button>` : 
                                '<span style="color: #666; font-size: 12px;">-</span>'}
                        </td>
                    </tr>
                `;
            });
            tableBody.innerHTML = html;
        } catch (error) {
            tableBody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 20px; color: #ff6b6b;">Gagal memuat: ${error.message}</td></tr>`;
        }
    }

    const formCreateAgencyUser = document.getElementById('formCreateAgencyUser');
    if (formCreateAgencyUser) {
        formCreateAgencyUser.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('agencyNewEmail').value;
            const password = document.getElementById('agencyNewPassword').value;
            const newRole = document.getElementById('agencyNewRole').value;
            const btn = document.getElementById('btnCreateAgencyUser');
            const msg = document.getElementById('agencyCreateMessage');

            btn.disabled = true;
            btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Memproses...';
            msg.classList.add('hidden');

            try {
                const res = await fetch('/api/agency/create-user', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${window.currentUser.token}`
                    },
                    body: JSON.stringify({ email, password, newRole })
                });

                const data = await res.json();
                if (data.error) throw new Error(data.error);

                msg.classList.remove('hidden');
                msg.style.backgroundColor = 'rgba(74, 222, 128, 0.1)';
                msg.style.color = '#4ade80';
                msg.innerText = data.message;

                formCreateAgencyUser.reset();
                await fetchUserProfile(); // refresh quota
                loadAgencyUsers();
            } catch (error) {
                msg.classList.remove('hidden');
                msg.style.backgroundColor = 'rgba(255, 107, 107, 0.1)';
                msg.style.color = '#ff6b6b';
                msg.innerText = 'Gagal: ' + error.message;
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<i class="ph ph-plus"></i> Buat Klien';
            }
        });
    }

    // Global func for owner to add quota
    window.addQuota = async function(targetUserId) {
        const agencyQ = prompt('Tambah Kuota Agency:', '0');
        const personalQ = prompt('Tambah Kuota Personal:', '0');
        
        if (agencyQ !== null && personalQ !== null) {
            try {
                const res = await fetch('/api/agency/add-quota', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${window.currentUser.token}`
                    },
                    body: JSON.stringify({ 
                        targetUserId, 
                        add_agency: parseInt(agencyQ) || 0, 
                        add_personal: parseInt(personalQ) || 0 
                    })
                });
                const data = await res.json();
                if(data.error) throw new Error(data.error);
                alert(data.message);
                loadAgencyUsers();
            } catch (err) {
                alert('Error: ' + err.message);
            }
        }
    };

    // Global func for owner to change role
    window.changeRole = async function(targetUserId, currentRole) {
        const newRole = prompt(`Ubah role (Status saat ini: ${currentRole}).\nPilihan: free, personal, agency, super_agency`, currentRole);
        
        if (newRole && newRole !== currentRole && ['free', 'personal', 'agency', 'super_agency'].includes(newRole.trim().toLowerCase())) {
            try {
                const res = await fetch('/api/agency/update-role', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${window.currentUser.token}`
                    },
                    body: JSON.stringify({ 
                        targetUserId, 
                        newRole: newRole.trim().toLowerCase()
                    })
                });
                const data = await res.json();
                if(data.error) throw new Error(data.error);
                alert(data.message);
                loadAgencyUsers();
            } catch (err) {
                alert('Error: ' + err.message);
            }
        } else if (newRole && !['free', 'personal', 'agency', 'super_agency'].includes(newRole.trim().toLowerCase())) {
            alert('Status tidak valid. Harap masukkan salah satu dari: free, personal, agency, super_agency');
        }
    };
});
