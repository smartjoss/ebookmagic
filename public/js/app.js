document.addEventListener('DOMContentLoaded', () => {
    let canvasPages = [];
    let currentCanvasPage = 0;

    // --- UTILITY FUNCTIONS ---
    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function rgbToHex(color) {
        if (!color) return '#000000';
        if (color.startsWith('#') && (color.length === 7 || color.length === 4)) return color;
        const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (match) {
            return '#' + [match[1], match[2], match[3]].map(x => {
                const hex = parseInt(x).toString(16);
                return hex.length === 1 ? '0' + hex : hex;
            }).join('');
        }
        return '#000000';
    }

    // Dirty flag for unsaved changes
    window._isDirty = false;
    
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

    // --- AUTO REFRESH TOKEN (setiap 45 menit) ---
    async function refreshToken() {
        if (!window.currentUser || !window.currentUser.refresh_token) return;
        try {
            const res = await fetch('/api/auth/refresh-token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refresh_token: window.currentUser.refresh_token })
            });
            const data = await res.json();
            if (data.success && data.token) {
                window.currentUser.token = data.token;
                window.currentUser.refresh_token = data.refresh_token;
                window.currentUser = { ...window.currentUser, ...data.user, token: data.token, refresh_token: data.refresh_token };
                localStorage.setItem('ebookMagicUser', JSON.stringify(window.currentUser));
                console.log('✅ Sesi berhasil diperpanjang otomatis.');
            } else {
                console.warn('⚠️ Refresh token expired. Sesi berakhir.');
                localStorage.removeItem('ebookMagicUser');
                if (window.currentUser) {
                    window.currentUser = null;
                    alert('Sesi login Anda telah kedaluwarsa. Silakan login kembali untuk melanjutkan pekerjaan Anda.');
                    document.getElementById('authView').style.display = 'flex';
                    document.getElementById('mainAppContainer').style.pointerEvents = 'none';
                    document.getElementById('mainAppContainer').style.opacity = '0.5';
                }
            }
        } catch (err) {
            console.warn('⚠️ Gagal refresh token:', err.message);
        }
    }
    // Jalankan refresh setiap 45 menit (2700000 ms)
    setInterval(refreshToken, 45 * 60 * 1000);
    // Juga refresh sekali saat halaman pertama kali dibuka
    if (window.currentUser) setTimeout(refreshToken, 3000);
    
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
        authTitle.innerText = 'Buat Akun';
        authSubtitle.innerText = 'Mulai perjalanan Anda bersama kami';
        authMessage.classList.add('hidden');
    });

    // Warn user before closing/refreshing (only if there are unsaved changes)
    window.addEventListener('beforeunload', (e) => {
        if (window._isDirty) {
            e.preventDefault();
            e.returnValue = 'Anda memiliki proyek yang mungkin belum tersimpan. Yakin ingin keluar?';
            return e.returnValue;
        }
    });

    linkShowLogin.addEventListener('click', (e) => {
        e.preventDefault();
        registerForm.classList.add('hidden');
        loginForm.classList.remove('hidden');
        authTitle.innerText = 'Selamat Datang';
        authSubtitle.innerText = 'Masuk ke akun Anda';
        authMessage.classList.add('hidden');
    });

    linkForgotPassword.addEventListener('click', (e) => {
        e.preventDefault();
        loginForm.classList.add('hidden');
        forgotForm.classList.remove('hidden');
        authTitle.innerText = 'Reset Kata Sandi';
        authSubtitle.innerText = 'Kami akan mengirim tautan pemulihan';
        authMessage.classList.add('hidden');
    });

    // API Key Feedback
    const inputApiKey = document.getElementById('inputApiKey');
    const apiKeyStatus = document.getElementById('apiKeyStatus');
    if (inputApiKey && apiKeyStatus) {
        const savedApiKey = localStorage.getItem('ebookMagicApiKey');
        if (savedApiKey) {
            const cleanKey = savedApiKey.trim();
            window.userApiKey = cleanKey;
            inputApiKey.value = cleanKey;
            inputApiKey.type = 'password';
            // Re-save cleaned key
            if (cleanKey !== savedApiKey) {
                localStorage.setItem('ebookMagicApiKey', cleanKey);
            }
        }

        // Simpan otomatis saat diketik atau dipaste
        inputApiKey.addEventListener('input', (e) => {
            const val = inputApiKey.value.trim();
            if (val.length > 5) {
                // Auto-trim: update the input field with trimmed value
                inputApiKey.value = val;
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

        // Also trim on paste event for immediate cleanup
        inputApiKey.addEventListener('paste', (e) => {
            setTimeout(() => {
                const val = inputApiKey.value.trim();
                inputApiKey.value = val;
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
            }, 50);
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
        authTitle.innerText = 'Selamat Datang';
        authSubtitle.innerText = 'Masuk ke akun Anda';
        authMessage.classList.add('hidden');
    });

    // 1. Login Handler
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;
        const btn = document.getElementById('btnLoginSubmit');
        
        btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Memuat...';
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
                window.currentUser = { ...data.user, token: data.token, refresh_token: data.refresh_token }; 
                localStorage.setItem('ebookMagicUser', JSON.stringify(window.currentUser)); // Persist session
                fetchUserProfile();
                loadProjects(); 
                setTimeout(() => {
                    authView.style.display = 'none';
                    mainAppContainer.classList.remove('hidden');
                    mainAppContainer.style.pointerEvents = 'auto';
                    mainAppContainer.style.opacity = '1';
                }, 1000);
            } else {
                throw new Error(data.error);
            }
        } catch (err) {
            showMessage(err.message, true);
        } finally {
            btn.innerHTML = 'Masuk';
            btn.disabled = false;
        }
    });

    // 2. Register Handler
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('registerEmail').value;
        const password = document.getElementById('registerPassword').value;
        const btn = document.getElementById('btnRegisterSubmit');
        
        btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Mendaftar...';
        btn.disabled = true;

        try {
            // Capture ref parameter from URL for affiliate tracking
            const urlRef = new URLSearchParams(window.location.search).get('ref');
            const res = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password, ref: urlRef || null })
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
            btn.innerHTML = 'Buat Akun Baru';
            btn.disabled = false;
        }
    });

    // 3. Forgot Password Handler
    forgotForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('forgotEmail').value;
        const btn = document.getElementById('btnForgotSubmit');
        
        btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Mengirim...';
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
                setTimeout(() => linkBackToLogin.click(), 5000);
            } else {
                throw new Error(data.error);
            }
        } catch (err) {
            showMessage(err.message, true);
        } finally {
            btn.innerHTML = 'Kirim Tautan Pemulihan';
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

            if (data.error) {
                if (data.error.includes('JWT expired') || data.error.includes('Unauthorized')) {
                    alert('Sesi Anda telah berakhir. Silakan login kembali.');
                    localStorage.removeItem('ebookMagicUser');
                    window.currentUser = null;
                    document.getElementById('authView').style.display = 'flex';
                    document.getElementById('mainAppContainer').style.pointerEvents = 'none';
                    document.getElementById('mainAppContainer').style.opacity = '0.5';
                    return;
                }
                throw new Error(data.error);
            }

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
                        <h4>${escapeHtml(ebook.title || 'Untitled Ebook')}</h4>
                        <span>Updated ${date}</span>
                        <div style="display: flex; gap: 8px; margin-top: 10px;">
                            <button class="btn-primary edit-btn" style="flex: 1; padding: 6px 10px; font-size: 12px; border-radius: 4px;"><i class="ph ph-pencil-simple"></i> Edit</button>
                            <button class="btn-ghost delete-btn" style="flex: 1; padding: 6px 10px; font-size: 12px; border-radius: 4px; border: 1px solid #ff4444; color: #ff4444;"><i class="ph ph-trash"></i> Hapus</button>
                        </div>
                    </div>
                `;
                
                const editBtn = card.querySelector('.edit-btn');
                const deleteBtn = card.querySelector('.delete-btn');

                // Delete Project
                deleteBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    if(confirm('Yakin ingin menghapus proyek ini secara permanen?')) {
                        deleteBtn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Menghapus...';
                        try {
                            const res = await fetch(`/api/ebooks/${ebook.id}`, {
                                method: 'DELETE',
                                headers: {
                                    'Authorization': `Bearer ${window.currentUser.token || ''}`
                                }
                            });
                            if(!res.ok) throw new Error('Gagal menghapus');
                            card.remove();
                            // Update counter
                            const stat = document.getElementById('statTotalEbooks');
                            if (stat) stat.innerText = Math.max(0, parseInt(stat.innerText) - 1);
                        } catch(err) {
                            console.error(err);
                            alert('Gagal menghapus proyek.');
                            deleteBtn.innerHTML = '<i class="ph ph-trash"></i> Hapus';
                        }
                    }
                });

                // On click, load the project into memory and go to editor
                const loadProjectData = () => {
                    let parsedOutline = ebook.outline;
                    if (typeof parsedOutline === 'string') {
                        try { parsedOutline = JSON.parse(parsedOutline); } catch(e) { parsedOutline = []; }
                    }
                    // Handle legacy data where the whole object was saved instead of the array
                    if (parsedOutline && typeof parsedOutline === 'object' && !Array.isArray(parsedOutline)) {
                        parsedOutline = parsedOutline.outline || [];
                    }
                    if (!Array.isArray(parsedOutline)) {
                        parsedOutline = [];
                    }

                    let parsedChapters = ebook.chapters;
                    if (typeof parsedChapters === 'string') {
                        try { parsedChapters = JSON.parse(parsedChapters); } catch(e) { parsedChapters = {}; }
                    }

                    window.currentProjectId = ebook.id;
                    window.currentOutlineData = { title: ebook.title || 'Untitled Ebook', subtitle: ebook.niche || '', outline: parsedOutline };
                    window.currentNiche = ebook.niche;
                    window.chaptersContent = parsedChapters || {};
                    window.currentAudience = (canvasDataObj && canvasDataObj.audience) || ebook.niche || '';
                    window.currentEbookType = (canvasDataObj && canvasDataObj.ebookType) || 'praktis';
                    window.currentAuthorProfile = (canvasDataObj && canvasDataObj.authorProfile) || '';
                    window.currentCTA = (canvasDataObj && canvasDataObj.cta) || '';
                    
                    // Load Canvas Data BEFORE proceeding to chapters/editor
                    let cData = ebook.canvas_data;
                    if (typeof cData === 'string') {
                        try { cData = JSON.parse(cData); } catch(e) {}
                    }
                    
                    if(cData && Object.keys(cData).length > 0) {
                        if (cData.pages) {
                            canvasPages = cData.pages;
                            currentCanvasPage = cData.currentPage || 0;
                        } else {
                            canvasPages = Array.isArray(cData) ? cData : [JSON.stringify(cData)];
                            currentCanvasPage = 0;
                        }
                        window.selectedTemplateId = cData.selectedTemplateId || 'modern';
                        window.selectedTemplateDetails = TEMPLATES_DATA.find(t => t.id === window.selectedTemplateId) || TEMPLATES_DATA[0];
                        const editorTemplateSelector = document.getElementById('editorTemplateSelector');
                        if (editorTemplateSelector) {
                            editorTemplateSelector.value = window.selectedTemplateId;
                        }
                    } else {
                        canvasPages = [];
                        currentCanvasPage = 0;
                        window.selectedTemplateId = 'modern';
                        window.selectedTemplateDetails = TEMPLATES_DATA[0];
                    }

                    if (typeof hideAllViews === 'function') {
                        hideAllViews();
                    } else {
                        document.getElementById('dashboardView').classList.add('hidden');
                        const myEbooksView = document.getElementById('myEbooksView');
                        if (myEbooksView) myEbooksView.classList.add('hidden');
                    }
                    
                    const btnProceedToChapters = document.getElementById('btnProceedToChapters');
                    try {
                        if (btnProceedToChapters) {
                            btnProceedToChapters.click();
                        }
                    } catch(err) {
                        console.error('Error during transition:', err);
                    }
                };

                card.addEventListener('click', () => {
                    window.openedFromDashboard = true;
                    loadProjectData();
                });

                editBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    window.openedFromDashboard = true;
                    loadProjectData();
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
        const affiliateView = document.getElementById('affiliateView');
        if(affiliateView) affiliateView.classList.add('hidden');
    }

    // --- SEARCH BAR LOGIC ---
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            // Navigate to My Ebooks view if not already there
            if (query.length > 0 && myEbooksView && myEbooksView.classList.contains('hidden')) {
                navMyEbooks.click();
            }
            // Filter project cards
            const cards = document.querySelectorAll('#projectsGrid .project-card');
            cards.forEach(card => {
                const title = card.querySelector('.project-info h4');
                if (title) {
                    const match = title.textContent.toLowerCase().includes(query);
                    card.style.display = (query.length === 0 || match) ? '' : 'none';
                }
            });
        });
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
        btnCreateNew.click(); // Reset state and go to generator
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

    const navAffiliate = document.getElementById('navAffiliate');
    if (navAffiliate) {
        navAffiliate.addEventListener('click', (e) => {
            e.preventDefault();
            setActiveNav(navAffiliate);
            hideAllViews();
            const affiliateView = document.getElementById('affiliateView');
            if (affiliateView) affiliateView.classList.remove('hidden');
            
            // Set Affiliate Link
            const affiliateLinkInput = document.getElementById('affiliateLinkInput');
            if (affiliateLinkInput && window.currentUser) {
                const protocol = window.location.protocol;
                const host = window.location.host;
                affiliateLinkInput.value = `${protocol}//${host}/?ref=${window.currentUser.id}`;
            }
        });
    }

    // Affiliate & Free Member Handlers
    const btnCopyAffiliateLink = document.getElementById('btnCopyAffiliateLink');
    if (btnCopyAffiliateLink) {
        btnCopyAffiliateLink.addEventListener('click', () => {
            const input = document.getElementById('affiliateLinkInput');
            if (input) {
                navigator.clipboard.writeText(input.value).then(() => {
                    const originalText = btnCopyAffiliateLink.innerHTML;
                    btnCopyAffiliateLink.innerHTML = '<i class="ph ph-check"></i> Tersalin!';
                    setTimeout(() => {
                        btnCopyAffiliateLink.innerHTML = originalText;
                    }, 2000);
                });
            }
        });
    }

    const formCreateFreeMember = document.getElementById('formCreateFreeMember');
    if (formCreateFreeMember) {
        formCreateFreeMember.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('freeMemberEmail').value;
            const password = document.getElementById('freeMemberPassword').value;
            const btn = document.getElementById('btnCreateFreeMember');
            const msgDiv = document.getElementById('freeMemberMessage');
            
            btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Menambahkan...';
            btn.disabled = true;
            msgDiv.classList.add('hidden');

            try {
                // Gunakan endpoint register untuk membuat free member
                const res = await fetch('/api/auth/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password, role: 'free', ref: window.currentUser ? window.currentUser.id : null })
                });
                const data = await res.json();

                if (data.success) {
                    msgDiv.classList.remove('hidden');
                    msgDiv.style.backgroundColor = 'rgba(74, 222, 128, 0.1)';
                    msgDiv.style.color = '#4ade80';
                    msgDiv.style.border = '1px solid rgba(74, 222, 128, 0.3)';
                    msgDiv.innerText = 'Berhasil menambahkan member gratis!';
                    formCreateFreeMember.reset();
                } else {
                    throw new Error(data.error || 'Gagal menambahkan member');
                }
            } catch (err) {
                msgDiv.classList.remove('hidden');
                msgDiv.style.backgroundColor = 'rgba(255, 107, 107, 0.1)';
                msgDiv.style.color = '#ff6b6b';
                msgDiv.style.border = '1px solid rgba(255, 107, 107, 0.3)';
                msgDiv.innerText = err.message;
            } finally {
                btn.innerHTML = '<i class="ph ph-plus"></i> Tambah Member';
                btn.disabled = false;
            }
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
        const oRes = document.getElementById('outlineResults');
        if(oRes) oRes.classList.add('hidden');
        
        const tRes = document.getElementById('titleResults');
        if(tRes) tRes.classList.add('hidden');
        
        const cpBox = document.getElementById('coverPromptBox');
        if(cpBox) cpBox.classList.add('hidden');
        
        const btnGenOut = document.getElementById('btnGenerateOutline');
        if(btnGenOut) btnGenOut.classList.add('hidden');
        
        const s1Form = document.getElementById('step1Form');
        if(s1Form) s1Form.classList.remove('hidden');
        
        const inputNiche = document.getElementById('inputNiche');
        if(inputNiche) inputNiche.value = '';
        const inputAudience = document.getElementById('inputAudience');
        if(inputAudience) inputAudience.value = '';
        const inputAuthorProfile = document.getElementById('inputAuthorProfile');
        if(inputAuthorProfile) inputAuthorProfile.value = '';
        const inputCTA = document.getElementById('inputCTA');
        if(inputCTA) inputCTA.value = '';
        const inputCustomOutline = document.getElementById('inputCustomOutline');
        if(inputCustomOutline) inputCustomOutline.value = '';
        const customOutlineSection = document.getElementById('customOutlineSection');
        if(customOutlineSection) customOutlineSection.style.display = 'none';
        const iconToggle = document.getElementById('iconToggleOutline');
        if(iconToggle) iconToggle.style.transform = 'rotate(0deg)';
        // Hide custom outline buttons if any
        const btnUseCustom = document.getElementById('btnUseCustomOutline');
        if(btnUseCustom) btnUseCustom.classList.add('hidden');
        const btnRefineCustom = document.getElementById('btnRefineCustomOutline');
        if(btnRefineCustom) btnRefineCustom.classList.add('hidden');
        
        window.selectedEbookTitle = null;
        window.selectedEbookSubtitle = null;
        
        // Reset step indicators
        document.querySelectorAll('.wizard-steps .step').forEach((el, index) => {
            if (index === 0) el.classList.add('active');
            else el.classList.remove('active');
        });
    }

    const btnGenerateTitles = document.getElementById('btnGenerateTitles');
    const titleResults = document.getElementById('titleResults');
    const titleOptionsGrid = document.getElementById('titleOptionsGrid');
    const coverPromptBox = document.getElementById('coverPromptBox');
    const coverPromptText = document.getElementById('coverPromptText');
    const btnCopyCoverPrompt = document.getElementById('btnCopyCoverPrompt');
    const step1Form = document.getElementById('step1Form');

    // --- CUSTOM OUTLINE TOGGLE ---
    const toggleCustomOutline = document.getElementById('toggleCustomOutline');
    if (toggleCustomOutline) {
        toggleCustomOutline.addEventListener('click', () => {
            const section = document.getElementById('customOutlineSection');
            const icon = document.getElementById('iconToggleOutline');
            if (section.style.display === 'none') {
                section.style.display = 'block';
                icon.style.transform = 'rotate(180deg)';
            } else {
                section.style.display = 'none';
                icon.style.transform = 'rotate(0deg)';
            }
        });
    }

    // Helper: check if user has entered a custom outline
    function getCustomOutlineLines() {
        const input = document.getElementById('inputCustomOutline');
        if (!input || !input.value.trim()) return [];
        return input.value.trim().split('\n').map(l => l.trim()).filter(l => l.length > 0);
    }

    // Helper: show/hide custom outline action buttons after title selection
    function updateOutlineButtons() {
        const customLines = getCustomOutlineLines();
        const btnUseCustom = document.getElementById('btnUseCustomOutline');
        const btnRefineCustom = document.getElementById('btnRefineCustomOutline');

        if (customLines.length >= 2) {
            // User has a custom outline — show both options
            if (btnUseCustom) {
                btnUseCustom.classList.remove('hidden');
            }
            if (btnRefineCustom) {
                btnRefineCustom.classList.remove('hidden');
            }
            // Also show the normal AI outline button but change its label
            btnGenerateOutline.disabled = false;
            btnGenerateOutline.classList.add('hidden'); // Hide default, replaced by custom buttons
        } else {
            // No custom outline — show only the AI generate button
            if (btnUseCustom) btnUseCustom.classList.add('hidden');
            if (btnRefineCustom) btnRefineCustom.classList.add('hidden');
            btnGenerateOutline.disabled = false;
            btnGenerateOutline.classList.remove('hidden');
        }
    }

    // Title Generation Logic
    if (btnGenerateTitles) {
        btnGenerateTitles.addEventListener('click', async () => {
            const apiKey = document.getElementById('inputApiKey').value.trim();
            const niche = document.getElementById('inputNiche').value;
            const audience = document.getElementById('inputAudience').value;
            const goal = document.getElementById('inputGoal') ? document.getElementById('inputGoal').value : '';

            if(!apiKey) return alert('Silakan masukkan API Key (Gemini atau OpenAI) terlebih dahulu.');
            if(!niche || !audience) return alert('Masukkan niche dan audiens.');

            btnGenerateTitles.disabled = true;
            btnGenerateTitles.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Mencari Ide...';

            try {
                window.userApiKey = apiKey;
                localStorage.setItem('ebookMagicApiKey', apiKey);

                const response = await fetch('/api/generate-titles', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ niche, audience, goal, apiKey })
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

                        // Show cover prompt and marketing insights
                        coverPromptText.innerText = item.cover_prompt;
                        
                        if (document.getElementById('aiMarketingHook')) {
                            document.getElementById('aiMarketingHook').innerText = item.hook || '-';
                        }
                        if (document.getElementById('aiMarketingPositioning')) {
                            document.getElementById('aiMarketingPositioning').innerText = item.positioning || '-';
                        }
                        if (document.getElementById('aiMarketingTarget')) {
                            document.getElementById('aiMarketingTarget').innerText = item.target_reader || '-';
                        }

                        const insightsDiv = document.getElementById('aiMarketingInsights');
                        if (insightsDiv) {
                            if (item.hook) {
                                insightsDiv.classList.remove('hidden');
                            } else {
                                insightsDiv.classList.add('hidden');
                            }
                        }

                        coverPromptBox.classList.remove('hidden');

                        // Enable outline generation (with custom outline awareness)
                        updateOutlineButtons();
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
                    
                    // Show a generic cover prompt for the original theme
                    coverPromptText.innerText = `Ebook cover design, a high quality, professional, 8k resolution, modern minimalist book cover illustration about ${niche}. Vertical composition, empty space for title text, clear background. --ar 2:3 --v 6.0`;
                    
                    const insightsDiv = document.getElementById('aiMarketingInsights');
                    if (insightsDiv) insightsDiv.classList.add('hidden');
                    
                    coverPromptBox.classList.remove('hidden');

                    updateOutlineButtons();
                });
                titleOptionsGrid.appendChild(originalCard);

                titleResults.classList.remove('hidden');
                step1Form.classList.add('hidden'); // Hide form

                // Inject custom outline action buttons if not already there
                if (!document.getElementById('btnUseCustomOutline')) {
                    const customBtnsContainer = document.createElement('div');
                    customBtnsContainer.id = 'customOutlineBtns';
                    customBtnsContainer.style.cssText = 'display: flex; gap: 10px; flex-direction: column;';
                    customBtnsContainer.innerHTML = `
                        <button class="btn-primary w-full hidden" id="btnUseCustomOutline" style="background: #10b981;">
                            <i class="ph ph-check-circle"></i> Gunakan Kerangka Saya Langsung
                        </button>
                        <button class="btn-primary w-full hidden" id="btnRefineCustomOutline" style="background: #f59e0b;">
                            <i class="ph ph-sparkle"></i> Perbaiki & Kembangkan Kerangka Saya (AI)
                        </button>
                    `;
                    // Insert after the generate outline button
                    btnGenerateOutline.parentNode.insertBefore(customBtnsContainer, btnGenerateOutline.nextSibling);

                    // --- USE CUSTOM OUTLINE DIRECTLY ---
                    document.getElementById('btnUseCustomOutline').addEventListener('click', () => {
                        const customLines = getCustomOutlineLines();
                        if (customLines.length < 2) return alert('Daftar isi Anda terlalu pendek. Minimal 2 bab.');

                        const niche = document.getElementById('inputNiche').value;
                        const audience = document.getElementById('inputAudience').value;
                        const type = document.getElementById('inputType') ? document.getElementById('inputType').value : 'praktis';
                        const authorProfile = document.getElementById('inputAuthorProfile') ? document.getElementById('inputAuthorProfile').value : '';
                        const cta = document.getElementById('inputCTA') ? document.getElementById('inputCTA').value : '';

                        const title = window.selectedEbookTitle || niche || 'Untitled Ebook';
                        const subtitle = window.selectedEbookSubtitle || `Panduan untuk ${audience}`;

                        // Build data as if API returned it
                        const data = {
                            title: title,
                            subtitle: subtitle,
                            outline: customLines
                        };

                        // RESET EDITOR & CANVAS STATE FOR NEW EBOOK
                        window.chaptersContent = {};
                        if (typeof canvasPages !== 'undefined') {
                            canvasPages.length = 0;
                            currentCanvasPage = 0;
                            if (typeof canvas !== 'undefined' && canvas) {
                                canvas.clear();
                            }
                        }

                        window._isDirty = true;
                        window.currentOutlineData = data;
                        window.currentNiche = niche;
                        window.currentEbookType = type;
                        window.currentAudience = audience;
                        window.currentAuthorProfile = authorProfile;
                        window.currentCTA = cta;

                        // Render outline results
                        outlineResults.classList.remove('hidden');
                        btnGenerateOutline.classList.add('hidden');
                        document.getElementById('btnUseCustomOutline').classList.add('hidden');
                        document.getElementById('btnRefineCustomOutline').classList.add('hidden');

                        // Update Stepper
                        document.querySelectorAll('.wizard-steps .step').forEach((el, index) => {
                            if (index === 0) el.classList.remove('active');
                            if (index === 1) el.classList.add('active');
                        });

                        let html = `
                            <div style="margin-bottom: 16px;">
                                <h4 style="color: var(--primary); margin-bottom: 4px;">${escapeHtml(data.title)}</h4>
                                <p style="color: var(--text-secondary); font-size: 14px;">${escapeHtml(data.subtitle)}</p>
                                <span style="font-size: 11px; padding: 3px 10px; background: rgba(16, 185, 129, 0.15); border-radius: 20px; color: #10b981;"><i class="ph ph-user"></i> Kerangka milik Anda sendiri</span>
                            </div>
                            <ul class="outline-list">
                        `;
                        data.outline.forEach(chapter => {
                            html += `<li class="outline-item"><i class="ph ph-check-circle"></i><span>${escapeHtml(chapter)}</span></li>`;
                        });
                        html += '</ul>';
                        outlineContent.innerHTML = html;
                    });

                    // --- REFINE CUSTOM OUTLINE WITH AI ---
                    document.getElementById('btnRefineCustomOutline').addEventListener('click', () => {
                        // Store the custom outline for the API to use
                        window._customOutlineForRefine = getCustomOutlineLines();
                        // Trigger the normal outline generation (which will pass the custom outline)
                        btnGenerateOutline.click();
                    });
                }

                // Now update which buttons to show
                updateOutlineButtons();
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
        const apiKey = document.getElementById('inputApiKey').value.trim();
        const niche = document.getElementById('inputNiche').value;
        const audience = document.getElementById('inputAudience').value;

        if(!apiKey) {
            alert('Silakan masukkan API Key (Gemini atau OpenAI) terlebih dahulu.');
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
        // Also hide custom outline buttons during generation
        const _btnUseCustom = document.getElementById('btnUseCustomOutline');
        if (_btnUseCustom) _btnUseCustom.classList.add('hidden');
        const _btnRefineCustom = document.getElementById('btnRefineCustomOutline');
        if (_btnRefineCustom) _btnRefineCustom.classList.add('hidden');
        
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

            // Check if there's a custom outline to refine
            const customOutline = window._customOutlineForRefine || null;
            window._customOutlineForRefine = null; // Clear after use

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
                    cta,
                    customOutline
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
            window._isDirty = true;
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
    const btnSaveOutlineOnly = document.getElementById('btnSaveOutlineOnly');
    
    let quill;
    let activeChapterElement = null;
    if (!window.chaptersContent) window.chaptersContent = {}; // Initialize only if not already set from loaded project

    if (btnSaveOutlineOnly) {
        btnSaveOutlineOnly.addEventListener('click', async () => {
            if(!window.currentUser) return alert('Anda harus login untuk menyimpan.');
            if(!window.currentOutlineData) return alert('Daftar isi kosong.');

            btnSaveOutlineOnly.disabled = true;
            const originalText = btnSaveOutlineOnly.innerHTML;
            btnSaveOutlineOnly.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Menyimpan...';

            try {
                const payload = {
                    projectId: window.currentProjectId,
                    userId: window.currentUser.id,
                    title: window.currentOutlineData.title || 'Untitled Ebook',
                    niche: window.currentNiche || '',
                    outline: window.currentOutlineData.outline || [],
                    chapters: {},
                    canvasData: {},
                    token: window.currentUser.token
                };

                const response = await fetch('/api/save-ebook', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                const result = await response.json();
                if(result.error) throw new Error(result.error);
                if (result.projectId) window.currentProjectId = result.projectId;
                window._isDirty = false;

                alert('✅ Konsep eBook berhasil disimpan! Anda bisa melihatnya nanti di menu "eBook Saya".');
            } catch(error) {
                console.error(error);
                if (error.message.includes('JWT expired') || error.message.includes('Unauthorized') || error.message.includes('Sesi')) {
                    alert('Sesi Anda telah berakhir. Silakan login kembali untuk menyimpan konsep.');
                    localStorage.removeItem('ebookMagicUser');
                    window.currentUser = null;
                    document.getElementById('authView').style.display = 'flex';
                    document.getElementById('mainAppContainer').style.pointerEvents = 'none';
                    document.getElementById('mainAppContainer').style.opacity = '0.5';
                } else {
                    alert('❌ Gagal menyimpan konsep: ' + error.message);
                }
            } finally {
                btnSaveOutlineOnly.disabled = false;
                btnSaveOutlineOnly.innerHTML = originalText;
            }
        });
    }

    btnProceedToChapters.addEventListener('click', () => {
        if(!window.currentOutlineData || !Array.isArray(window.currentOutlineData.outline) || window.currentOutlineData.outline.length === 0) {
            alert('Kerangka (Daftar Isi) tidak ditemukan atau kosong!\n\nSilakan isi Form AI untuk membuat ulang Kerangka Ebook Anda sebelum menulis bab.');
            
            // Redirect to Generator View
            if (typeof hideAllViews === 'function') hideAllViews();
            const gView = document.getElementById('generatorView');
            if (gView) gView.classList.remove('hidden');
            
            return;
        }
        
        // Freemium Block
        if (window.userProfile && window.userProfile.role === 'free') {
            alert('Akses Premium Diperlukan!\n\nSebagai Free Member, Anda hanya bisa membuat Kerangka (Daftar Isi).\nSilakan klik "Simpan Konsep eBook" lalu Upgrade lisensi Anda untuk meng-unlock fitur Penulisan Bab Otomatis, Desain Sampul, dan Ekspor PDF!');
            return;
        }
        
        generatorView.classList.add('hidden');
        chapterWriterView.classList.remove('hidden');
        // Editor will be shown when user clicks "Lanjut ke Editor Desain"

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

        // Show editor buttons if project already has chapter content
        const hasExistingContent = window.chaptersContent && Object.keys(window.chaptersContent).some(k => window.chaptersContent[k] && window.chaptersContent[k].trim() !== '');
        if (hasExistingContent) {
            if (btnProceedToEditor) btnProceedToEditor.classList.remove('hidden');
            const btnCopy = document.getElementById('btnCopyAllToCanvas');
            if (btnCopy) btnCopy.classList.remove('hidden');
        }

        // If project has canvas data, auto-show the editor below
        if (canvasPages.length > 0) {
            editorView.classList.remove('hidden');
            initCanvas();
        }
    });

    btnBackToOutline.addEventListener('click', () => {
        // Save current quill content before leaving
        if (activeChapterElement && quill) {
            window.chaptersContent[activeChapterElement.innerText] = quill.root.innerHTML;
        }
        // Hide both chapter writer and editor views
        chapterWriterView.classList.add('hidden');
        if (typeof editorView !== 'undefined' && editorView) editorView.classList.add('hidden');
        
        if (window.openedFromDashboard) {
            hideAllViews();
            if(myEbooksView) myEbooksView.classList.remove('hidden');
            setActiveNav(navMyEbooks);
            window.openedFromDashboard = false;
        } else {
            generatorView.classList.remove('hidden');
        }
    });

    const btnAddChapterInWriter = document.getElementById('btnAddChapterInWriter');
    if (btnAddChapterInWriter) {
        btnAddChapterInWriter.addEventListener('click', () => {
            const chapterName = prompt('Masukkan nama bab baru:');
            if (chapterName && chapterName.trim() !== '') {
                const newChapter = chapterName.trim();
                if (!window.currentOutlineData.outline.includes(newChapter)) {
                    window.currentOutlineData.outline.push(newChapter);
                    window._isDirty = true;
                    
                    const li = document.createElement('li');
                    li.innerText = newChapter;
                    
                    li.addEventListener('click', () => {
                        if(activeChapterElement) {
                            window.chaptersContent[activeChapterElement.innerText] = quill.root.innerHTML;
                            activeChapterElement.classList.remove('active');
                        }
                        
                        li.classList.add('active');
                        activeChapterElement = li;
                        currentChapterTitle.innerText = newChapter;
                        
                        if(window.chaptersContent[newChapter]) {
                            quill.clipboard.dangerouslyPasteHTML(window.chaptersContent[newChapter]);
                        } else {
                            quill.setText('');
                        }
                    });
                    
                    const writerOutlineList = document.getElementById('writerOutlineList');
                    if (writerOutlineList) writerOutlineList.appendChild(li);
                    
                    li.click();
                } else {
                    alert('Bab dengan nama tersebut sudah ada.');
                }
            }
        });
    }

    btnGenerateChapterContent.addEventListener('click', async () => {
        if(!activeChapterElement) return;
        const chapterTitle = activeChapterElement.innerText;
        
        btnGenerateChapterContent.disabled = true;
        btnGenerateChapterContent.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Menulis...';
        quill.setText('AI sedang menulis bab Anda. Mohon tunggu beberapa saat...\n');

        try {
            const toneSelector = document.getElementById('chapterToneSelector');
            const selectedTone = toneSelector ? toneSelector.value : 'standar';
            const contextInput = document.getElementById('chapterContextInput');
            const customContext = contextInput ? contextInput.value : '';

            const response = await fetch('/api/generate-chapter', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    chapterTitle, 
                    niche: window.currentNiche, 
                    audience: window.currentAudience,
                    type: window.currentEbookType || 'praktis',
                    tone: selectedTone,
                    customContext: customContext,
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
            window._isDirty = true;
            
            // Show the editor buttons once content is generated
            if (btnProceedToEditor) btnProceedToEditor.classList.remove('hidden');
            const btnCopy = document.getElementById('btnCopyAllToCanvas');
            if (btnCopy) btnCopy.classList.remove('hidden');
        } catch(error) {
            console.error(error);
            alert('Gagal: ' + error.message);
        } finally {
            btnGenerateChapterContent.disabled = false;
            btnGenerateChapterContent.innerHTML = '<i class="ph ph-sparkle"></i> Tulis Konten (AI)';
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

        // Show editor BELOW chapter writer (don't hide chapter writer)
        editorView.classList.remove('hidden');
        initCanvas(); // Initialize Fabric.js Canvas
        
        // Scroll to the canvas editor smoothly
        setTimeout(() => {
            editorView.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 200);
    });

    // --- SMART COPY ALL CHAPTERS TO CANVAS ---
    const btnCopyAllToCanvas = document.getElementById('btnCopyAllToCanvas');
    if (btnCopyAllToCanvas) {
        btnCopyAllToCanvas.addEventListener('click', () => {
            // Save current quill content first
            if(activeChapterElement && quill) {
                window.chaptersContent[activeChapterElement.innerText] = quill.root.innerHTML;
            }

            if (!window.currentOutlineData || !window.currentOutlineData.outline) {
                return alert('Tidak ada data bab untuk disalin.');
            }

            // Show editor if not visible
            editorView.classList.remove('hidden');
            initCanvas();

            const outline = window.currentOutlineData.outline;
            const chaptersWithContent = outline.filter(ch => window.chaptersContent[ch] && window.chaptersContent[ch].trim() !== '');

            if (chaptersWithContent.length === 0) {
                return alert('Belum ada bab yang ditulis. Silakan generate konten AI dulu untuk minimal 1 bab.');
            }

            if (!confirm(`Akan menyalin ${chaptersWithContent.length} bab ke halaman Canvas dengan format rapi.\n\nHalaman cover yang sudah ada akan dipertahankan.\nLanjutkan?`)) return;

            btnCopyAllToCanvas.disabled = true;
            btnCopyAllToCanvas.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Menyalin...';

            // Save current canvas page first
            if (typeof saveCurrentPage === 'function') saveCurrentPage();

            // --- HTML Parser to Fabric.js elements ---
            function parseHtmlToElements(html) {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = html;
                const elements = [];

                function processNode(node) {
                    if (node.nodeType === Node.TEXT_NODE) {
                        const text = node.textContent.trim();
                        if (text) {
                            elements.push({ type: 'paragraph', text: text });
                        }
                        return;
                    }

                    if (node.nodeType !== Node.ELEMENT_NODE) return;

                    const tag = node.tagName.toLowerCase();

                    if (['h1', 'h2', 'h3', 'h4'].includes(tag)) {
                        const text = node.textContent.trim();
                        if (text) elements.push({ type: tag, text: text });
                    } else if (tag === 'ul' || tag === 'ol') {
                        const items = [];
                        node.querySelectorAll('li').forEach(li => {
                            const t = li.textContent.trim();
                            if (t) items.push(t);
                        });
                        if (items.length > 0) {
                            const prefix = tag === 'ol' ? 'num' : 'bullet';
                            const bulletText = items.map((item, i) => {
                                return prefix === 'num' ? `${i + 1}. ${item}` : `• ${item}`;
                            }).join('\n');
                            elements.push({ type: 'list', text: bulletText });
                        }
                    } else if (tag === 'p') {
                        let text = node.textContent.trim();
                        if (text) {
                            // Check if has bold/strong children
                            const isBold = node.querySelector('strong, b') && node.textContent === (node.querySelector('strong, b')?.textContent || '');
                            
                            // Split long paragraphs to prevent single objects exceeding canvas page height
                            const MAX_CHARS = 1200;
                            while (text.length > MAX_CHARS) {
                                let splitIndex = text.lastIndexOf(' ', MAX_CHARS);
                                if (splitIndex === -1) splitIndex = MAX_CHARS;
                                elements.push({ type: 'paragraph', text: text.substring(0, splitIndex).trim(), bold: isBold });
                                text = text.substring(splitIndex).trim();
                            }
                            if (text.length > 0) {
                                elements.push({ type: 'paragraph', text: text, bold: isBold });
                            }
                        }
                    } else if (tag === 'table') {
                        // Convert table to formatted text
                        let tableText = '';
                        node.querySelectorAll('tr').forEach(tr => {
                            const cells = [];
                            tr.querySelectorAll('td, th').forEach(cell => {
                                cells.push(cell.textContent.trim());
                            });
                            tableText += cells.join('  |  ') + '\n';
                        });
                        if (tableText.trim()) {
                            elements.push({ type: 'table', text: tableText.trim() });
                        }
                    } else {
                        // Recursively process children for divs, spans, etc.
                        node.childNodes.forEach(child => processNode(child));
                    }
                }

                tempDiv.childNodes.forEach(child => processNode(child));
                return elements;
            }

            // --- Create canvas pages from parsed elements ---
            const CANVAS_W = 800;
            const CANVAS_H = 1131;
            const MARGIN_X = 60;
            const MARGIN_TOP = 70;
            const MARGIN_BOTTOM = 80;
            const CONTENT_W = CANVAS_W - (MARGIN_X * 2);
            const MAX_Y = CANVAS_H - MARGIN_BOTTOM;

            const template = window.selectedTemplateDetails || TEMPLATES_DATA[0];
            const primaryFont = template.font.replace(/['"]/g, '').split(',')[0].trim();
            const bgFill = template.bg;
            const textFill = template.textColor;
            const accentFill = template.accent;

            function createNewPage() {
                const pageCanvas = new fabric.StaticCanvas(null, { width: CANVAS_W, height: CANVAS_H });
                pageCanvas.backgroundColor = bgFill;
                return pageCanvas;
            }

            function getTextHeight(text, fontSize, fontWeight, width) {
                // Approximate height calculation
                const charsPerLine = Math.floor(width / (fontSize * 0.55));
                const lines = text.split('\n').reduce((total, line) => {
                    return total + Math.max(1, Math.ceil(line.length / charsPerLine));
                }, 0);
                return lines * (fontSize * 1.5) + 10;
            }

            const allPages = [];
            // Keep existing cover page(s) if they exist
            if (canvasPages.length > 0) {
                canvasPages.forEach(p => allPages.push(p));
            }

            chaptersWithContent.forEach(chapterTitle => {
                const html = window.chaptersContent[chapterTitle];
                const elements = parseHtmlToElements(html);

                let currentPageObjs = [];
                let yPos = MARGIN_TOP;

                function flushPage() {
                    if (currentPageObjs.length === 0) return;
                    const pg = createNewPage();
                    currentPageObjs.forEach(obj => pg.add(obj));
                    allPages.push(JSON.stringify(pg.toJSON()));
                    currentPageObjs = [];
                    yPos = MARGIN_TOP;
                }

                // Add chapter title
                const titleObj = new fabric.Textbox(chapterTitle, {
                    left: MARGIN_X, top: yPos, width: CONTENT_W,
                    fontSize: 28, fontFamily: primaryFont, fontWeight: 800,
                    fill: accentFill, lineHeight: 1.3, splitByGrapheme: false
                });
                titleObj.setControlsVisibility({ mt: false, mb: false });
                const titleHeight = titleObj.height || getTextHeight(chapterTitle, 28, 800, CONTENT_W);
                currentPageObjs.push(titleObj);
                yPos += titleHeight + 20;

                // Add decorative line under chapter title
                const decorLine = new fabric.Rect({
                    left: MARGIN_X, top: yPos - 10,
                    width: 80, height: 4,
                    fill: accentFill, rx: 2, ry: 2
                });
                currentPageObjs.push(decorLine);
                yPos += 15;

                // Process each element
                elements.forEach(el => {
                    let fontSize = 14;
                    let fontWeight = 'normal';
                    let fill = textFill;
                    let spacing = 12;

                    if (el.type === 'h1') { fontSize = 24; fontWeight = 800; fill = textFill; spacing = 20; }
                    else if (el.type === 'h2') { fontSize = 20; fontWeight = 700; fill = textFill; spacing = 18; }
                    else if (el.type === 'h3') { fontSize = 17; fontWeight = 700; fill = textFill; spacing = 15; }
                    else if (el.type === 'h4') { fontSize = 15; fontWeight = 700; fill = textFill; spacing = 12; }
                    else if (el.type === 'list') { fontSize = 13; fill = textFill; spacing = 10; }
                    else if (el.type === 'table') { fontSize = 12; fill = textFill; spacing = 10; }
                    else if (el.bold) { fontWeight = 'bold'; }

                    let textObj = new fabric.Textbox(el.text, {
                        left: el.type === 'list' ? MARGIN_X + 15 : MARGIN_X,
                        top: yPos,
                        width: el.type === 'list' ? CONTENT_W - 15 : CONTENT_W,
                        fontSize: fontSize,
                        fontFamily: primaryFont,
                        fontWeight: fontWeight,
                        fill: fill,
                        lineHeight: 1.6,
                        splitByGrapheme: false
                    });

                    let elHeight = textObj.height || getTextHeight(el.text, fontSize, fontWeight, CONTENT_W);

                    // Check if we need a new page
                    if (yPos + elHeight > MAX_Y) {
                        flushPage();
                        // Update top position for the new page
                        textObj.set('top', yPos);
                    }

                    textObj.setControlsVisibility({ mt: false, mb: false });
                    currentPageObjs.push(textObj);
                    yPos += elHeight + spacing;
                });

                // Flush remaining content
                flushPage();
            });

            // Apply to canvas
            canvasPages.length = 0;
            allPages.forEach(p => canvasPages.push(p));
            currentCanvasPage = 0;
            loadPage(0);

            btnCopyAllToCanvas.disabled = false;
            btnCopyAllToCanvas.innerHTML = '<i class="ph ph-clipboard-text"></i> Salin Semua Bab ke Canvas';
            
            alert(`✅ Berhasil menyalin ${chaptersWithContent.length} bab ke ${canvasPages.length} halaman Canvas!\n\nGunakan navigasi halaman di bawah canvas untuk melihat semua halaman.`);

            // Scroll to editor
            setTimeout(() => {
                editorView.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 300);
        });
    }

    // --- EDITOR LOGIC (Fabric.js) ---
    const btnBackToDashboard = document.getElementById('btnBackToDashboard');

    let canvas;


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
                // Sync background color picker with current canvas background
                const bgPicker = document.getElementById('bgColorPicker');
                if (bgPicker && canvas.backgroundColor) {
                    bgPicker.value = canvas.backgroundColor;
                }
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
        const template = window.selectedTemplateDetails || TEMPLATES_DATA[0];
        canvas.backgroundColor = template.bg;
        canvasPages.push(JSON.stringify(canvas.toJSON()));
        currentCanvasPage = canvasPages.length - 1;
        updatePageIndicator();
    });
    document.getElementById('btnDeletePage')?.addEventListener('click', () => {
        if (canvasPages.length <= 1) {
            alert('Tidak dapat menghapus halaman. Ebook minimal harus memiliki 1 halaman.');
            return;
        }
        if (confirm('Apakah Anda yakin ingin menghapus halaman ini? Tindakan ini tidak dapat dibatalkan.')) {
            canvasPages.splice(currentCanvasPage, 1);
            if (currentCanvasPage >= canvasPages.length) {
                currentCanvasPage = canvasPages.length - 1;
            }
            loadPage(currentCanvasPage);
        }
    });

    function initCanvas() {
        if (!canvas) {
            canvas = new fabric.Canvas('ebookCanvas', {
                backgroundColor: '#ffffff',
                stopContextMenu: true,
                fireRightClick: true
            });

            // Global listener to fix non-breaking spaces and recalculate bounds when typing/pasting
            canvas.on('text:changed', function(e) {
                if (e.target && e.target.type === 'textbox') {
                    let text = e.target.text || '';
                    
                    // Convert non-breaking spaces and other invisible chars to normal spaces so wrapping works
                    if (/[\u00A0\u200B\u202F\uFEFF]/.test(text)) {
                        e.target.set('text', text.replace(/[\u00A0\u200B\u202F\uFEFF]/g, ' '));
                    }
                    
                    // Prevent textbox from expanding beyond canvas width due to long pasted words
                    const maxWidth = canvas.getWidth() - e.target.left;
                    if (e.target.width > maxWidth && maxWidth > 50) {
                        e.target.set('width', maxWidth);
                    } else if (e.target.width > canvas.getWidth()) {
                        e.target.set('width', canvas.getWidth());
                        e.target.set('left', 0);
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
                    
                    // Sync color (convert to hex for input[type=color])
                    const colorPicker = document.getElementById('colorPicker');
                    if (colorPicker && activeObject.fill) {
                        colorPicker.value = rgbToHex(activeObject.fill);
                    }
                }
            }
            canvas.on('selection:created', updateUIFromSelection);
            canvas.on('selection:updated', updateUIFromSelection);

            // --- UNDO/REDO HISTORY SYSTEM ---
            window._canvasHistory = [];
            window._canvasHistoryIndex = -1;
            window._canvasHistoryLocked = false;
            const MAX_HISTORY = 30;

            function saveCanvasState() {
                if (window._canvasHistoryLocked) return;
                // Remove any future states if we're in the middle of history
                if (window._canvasHistoryIndex < window._canvasHistory.length - 1) {
                    window._canvasHistory = window._canvasHistory.slice(0, window._canvasHistoryIndex + 1);
                }
                const state = JSON.stringify(canvas.toJSON());
                window._canvasHistory.push(state);
                // Limit history size
                if (window._canvasHistory.length > MAX_HISTORY) {
                    window._canvasHistory.shift();
                }
                window._canvasHistoryIndex = window._canvasHistory.length - 1;
            }

            window.canvasUndo = function() {
                if (window._canvasHistoryIndex <= 0) return;
                window._canvasHistoryLocked = true;
                window._canvasHistoryIndex--;
                canvas.loadFromJSON(window._canvasHistory[window._canvasHistoryIndex], function() {
                    canvas.renderAll();
                    window._canvasHistoryLocked = false;
                });
            };

            window.canvasRedo = function() {
                if (window._canvasHistoryIndex >= window._canvasHistory.length - 1) return;
                window._canvasHistoryLocked = true;
                window._canvasHistoryIndex++;
                canvas.loadFromJSON(window._canvasHistory[window._canvasHistoryIndex], function() {
                    canvas.renderAll();
                    window._canvasHistoryLocked = false;
                });
            };

            // Save state after every modification
            canvas.on('object:modified', saveCanvasState);
            canvas.on('object:added', saveCanvasState);
            canvas.on('object:removed', saveCanvasState);

            // Context Menu Logic
            canvas.on('mouse:down', function(e) {
                const contextMenu = document.getElementById('canvasContextMenu');
                if (e.button === 3) { // Right click
                    let target = e.target;
                    if (target) {
                        canvas.setActiveObject(target);
                        canvas.renderAll();
                        
                        const menuSplitText = document.getElementById('menuSplitText');
                        const menuInLineWithText = document.getElementById('menuInLineWithText');
                        
                        let showMenu = false;
                        menuSplitText.style.display = 'none';
                        menuInLineWithText.style.display = 'none';

                        if (target.type === 'textbox') {
                            menuSplitText.style.display = 'flex';
                            showMenu = true;
                        } else if (target.type === 'image') {
                            menuInLineWithText.style.display = 'flex';
                            showMenu = true;
                        }
                        
                        if (showMenu) {
                            contextMenu.style.left = e.e.clientX + 'px';
                            contextMenu.style.top = e.e.clientY + 'px';
                            contextMenu.classList.remove('hidden');
                            window._currentContextMenuTarget = target;
                        } else {
                            contextMenu.classList.add('hidden');
                        }
                    } else {
                        contextMenu.classList.add('hidden');
                    }
                } else {
                    contextMenu.classList.add('hidden'); // Hide on left click
                }
            });

            // Hide context menu on click elsewhere
            document.addEventListener('click', function(e) {
                const contextMenu = document.getElementById('canvasContextMenu');
                if (contextMenu && !e.target.closest('#canvasContextMenu') && e.button !== 2) {
                    contextMenu.classList.add('hidden');
                }
            });

            // Save initial state
            setTimeout(saveCanvasState, 500);

        } // End of if (!canvas)

        if (canvasPages.length === 0) {
            canvas.clear();
            
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
            const titleText = new fabric.Textbox(outline.title || 'Untitled Ebook', {
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
            const subtitleText = new fabric.Textbox(outline.subtitle || '', {
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


    // Back from Editor
    btnBackToDashboard.addEventListener('click', () => {
        hideAllViews();
        dashboardView.classList.remove('hidden');
        setActiveNav(navDashboard);
        loadProjects();
    });

    // Editor Tools
    document.getElementById('btnAddText').addEventListener('click', () => {
        if (!canvas) return alert('Canvas belum siap. Silakan buka editor terlebih dahulu.');
        
        const template = window.selectedTemplateDetails || TEMPLATES_DATA[0];
        const activeFont = template.font ? template.font.replace(/['"]/g, '').split(',')[0].trim() : 'Outfit';
        
        const text = new fabric.Textbox('Ketik di sini...', {
            left: 0,
            top: 100,
            width: 800, // FULL canvas width, NO limits!
            fontSize: 20,
            fontFamily: activeFont,
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

    // Toggle Bold
    const btnToggleBold = document.getElementById('btnToggleBold');
    if(btnToggleBold) {
        btnToggleBold.addEventListener('click', () => {
            const activeObject = canvas.getActiveObject();
            if (activeObject && activeObject.type === 'textbox') {
                if (activeObject.isEditing) {
                    const styles = activeObject.getSelectionStyles();
                    const isBold = styles.some(s => s.fontWeight === 'bold' || s.fontWeight === 700 || s.fontWeight === 800);
                    activeObject.setSelectionStyles({ fontWeight: isBold ? 'normal' : 'bold' });
                } else {
                    const isBold = activeObject.fontWeight === 'bold' || activeObject.fontWeight === 700 || activeObject.fontWeight === 800;
                    activeObject.set('fontWeight', isBold ? 'normal' : 'bold');
                }
                canvas.renderAll();
            }
        });
    }

    // Toggle Italic
    const btnToggleItalic = document.getElementById('btnToggleItalic');
    if(btnToggleItalic) {
        btnToggleItalic.addEventListener('click', () => {
            const activeObject = canvas.getActiveObject();
            if (activeObject && activeObject.type === 'textbox') {
                if (activeObject.isEditing) {
                    const styles = activeObject.getSelectionStyles();
                    const isItalic = styles.some(s => s.fontStyle === 'italic');
                    activeObject.setSelectionStyles({ fontStyle: isItalic ? 'normal' : 'italic' });
                } else {
                    const isItalic = activeObject.fontStyle === 'italic';
                    activeObject.set('fontStyle', isItalic ? 'normal' : 'italic');
                }
                canvas.renderAll();
            }
        });
    }

    // Toggle Bullet Points
    const btnToggleBullet = document.getElementById('btnToggleBullet');
    if(btnToggleBullet) {
        btnToggleBullet.addEventListener('click', () => {
            const activeObject = canvas.getActiveObject();
            if (activeObject && activeObject.type === 'textbox') {
                let lines = activeObject.text.split('\n');
                // Check if ALL non-empty lines have bullets
                let hasBullets = lines.every(line => line.trim() === '' || line.trim().startsWith('•'));
                
                if (hasBullets) {
                    // Remove bullets
                    lines = lines.map(line => line.trim().startsWith('•') ? line.replace(/^(\s*)•\s*/, '$1') : line);
                } else {
                    // Add bullets
                    lines = lines.map(line => (line.trim() !== '' && !line.trim().startsWith('•')) ? '• ' + line : line);
                }
                
                activeObject.set('text', lines.join('\n'));
                if (typeof activeObject.initDimensions === 'function') activeObject.initDimensions();
                canvas.renderAll();
            }
        });
    }

    ['Left', 'Center', 'Right'].forEach(align => {
        const btn = document.getElementById(`btnAlign${align}`);
        if(btn) {
            btn.addEventListener('click', () => {
                const objects = canvas.getActiveObjects();
                if (objects.length === 0) return; // Don't fallback to all textboxes
                
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
            const objects = canvas.getActiveObjects();
            if (objects.length === 0) return; // Don't fallback to all textboxes
            
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

    // Insert Link into Canvas
    document.getElementById('btnInsertLink').addEventListener('click', () => {
        if (!canvas) return alert('Canvas belum siap.');
        const url = prompt('Masukkan URL link:', 'https://');
        if (!url || url === 'https://') return;
        
        const linkText = prompt('Teks yang ditampilkan:', url);
        if (!linkText) return;

        const linkObj = new fabric.Textbox(linkText, {
            left: 50,
            top: 200,
            fontSize: 16,
            fontFamily: 'Inter',
            fill: '#6C63FF',
            underline: true,
            width: 700,
            editable: true,
            linkUrl: url // simpan URL sebagai metadata
        });
        canvas.add(linkObj);
        canvas.setActiveObject(linkObj);
        canvas.renderAll();
    });

    document.getElementById('btnAddRect').addEventListener('click', () => {
        if (!canvas) return alert('Canvas belum siap.');
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
        if (!canvas) return;
        const activeObjects = canvas.getActiveObjects();
        if (activeObjects.length) {
            canvas.discardActiveObject();
            activeObjects.forEach(function(object) {
                canvas.remove(object);
            });
        }
    });

    // --- ICON LIBRARY & LAYOUT SELECTOR ---
    const SVG_ICONS = {
        'Star': 'M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z',
        'Checkmark': 'M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z',
        'Arrow Right': 'M16.01 11H4v2h12.01v3L20 12l-3.99-4z',
        'Book': 'M12 11.55C9.64 9.35 6.48 8 3 8v11c3.48 0 6.64 1.35 9 3.55 2.36-2.2 5.52-3.55 9-3.55V8c-3.48 0-6.64 1.35-9 3.55z',
        'Lightbulb': 'M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7z',
        'User': 'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z',
        'Phone': 'M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z',
        'Email': 'M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z',
        'Calendar': 'M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11z',
        'Chat': 'M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z',
        'Globe': 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.53c-.26-.81-1-1.4-1.9-1.4h-1v-3c0-.55-.45-1-1-1h-6v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.4z',
        'Heart': 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z',
        'Shopping Cart': 'M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zm10 0c-1.1 0-1.99.9-1.99 2s.9 2 1.99 2 2-.9 2-2-.9-2-2-2zm-8.9-5h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49c.37-.66-.11-1.48-.87-1.48H5.21l-.94-2H1v2h2l3.6 7.59-1.35 2.44C4.52 15.37 5.48 17 7 17h12v-2H7l1.1-2z',
        'Tag': 'M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58.55 0 1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41 0-.55-.23-1.06-.59-1.42zM5.5 8C4.67 8 4 7.33 4 6.5S4.67 5 5.5 5 7 5.67 7 6.5 6.33 8 5.5 8z',
        'Trophy': 'M19 5h-2V3H7v2H5C3.9 5 3 5.9 3 7v1c0 2.55 1.92 4.63 4.39 4.94c.63 1.5 1.98 2.62 3.61 2.93V18H7v2h10v-2h-4v-2.13c1.63-.31 2.98-1.43 3.61-2.93C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.45 5 9.32 5 8zm14 0c0 1.32-.84 2.45-2 2.82V7h2v1z',
        'Quote': 'M6 17h3l2-4V7H5v6h3zm8 0h3l2-4V7h-6v6h3z',
        'Shield': 'M12 2L4 5v6.09c0 5.05 3.41 9.76 8 10.91 4.59-1.15 8-5.86 8-10.91V5l-8-3z',
        'Gear': 'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z',
        'Lock': 'M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z',
        'Home': 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z'
    };

    // Render icons inside the Floating Panel
    function setupIconPicker() {
        const grid = document.getElementById('iconGrid');
        if (!grid) return;
        grid.innerHTML = '';
        
        Object.keys(SVG_ICONS).forEach(name => {
            const path = SVG_ICONS[name];
            const btn = document.createElement('button');
            btn.style.cssText = 'background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; padding: 10px; cursor: pointer; color: white; display: flex; align-items: center; justify-content: center; width: 44px; height: 44px; transition: all 0.2s;';
            btn.title = name;
            btn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="${path}"/></svg>`;
            
            btn.addEventListener('mouseover', () => {
                btn.style.background = 'rgba(108, 99, 255, 0.2)';
                btn.style.borderColor = 'var(--primary)';
            });
            btn.addEventListener('mouseout', () => {
                btn.style.background = 'rgba(255,255,255,0.05)';
                btn.style.borderColor = 'rgba(255,255,255,0.1)';
            });
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                insertIconToCanvas(path);
                document.getElementById('iconPickerPanel').classList.add('hidden');
            });
            grid.appendChild(btn);
        });
    }

    function insertIconToCanvas(pathData) {
        if (!canvas) return alert('Canvas belum siap.');
        const template = window.selectedTemplateDetails || TEMPLATES_DATA[0];
        
        const path = new fabric.Path(pathData, {
            left: 100,
            top: 100,
            fill: template.accent || '#6C63FF',
            scaleX: 2.5,
            scaleY: 2.5
        });
        
        canvas.add(path);
        canvas.setActiveObject(path);
        canvas.renderAll();
        saveCurrentPage();
    }

    // Toggle Icon Panel
    document.getElementById('btnInsertIcon')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const panel = document.getElementById('iconPickerPanel');
        if (panel) {
            panel.classList.toggle('hidden');
        }
    });

    document.getElementById('btnCloseIconPicker')?.addEventListener('click', (e) => {
        e.stopPropagation();
        document.getElementById('iconPickerPanel').classList.add('hidden');
    });

    // Prevent closing icon panel when clicking inside it
    document.getElementById('iconPickerPanel')?.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    // Close panel on clicking elsewhere
    document.addEventListener('click', () => {
        const picker = document.getElementById('iconPickerPanel');
        if (picker) picker.classList.add('hidden');
    });

    // Setup icon picker once
    setupIconPicker();

    // --- DYNAMIC TEMPLATE SELECTOR IN EDITOR ---
    function applyTemplateToCanvas(templateId) {
        const template = TEMPLATES_DATA.find(t => t.id === templateId);
        if (!template || !canvas) return;

        window.selectedTemplateId = templateId;
        window.selectedTemplateDetails = template;

        canvas.backgroundColor = template.bg;
        const primaryFont = template.font.replace(/['"]/g, '').split(',')[0].trim();

        canvas.getObjects().forEach(obj => {
            if (obj.type === 'textbox') {
                obj.set({
                    fontFamily: primaryFont,
                    fill: template.textColor
                });
                if (typeof obj.initDimensions === 'function') obj.initDimensions();
            } else if (obj.type === 'rect' && (obj.height <= 8 || obj.fill === '#6C63FF' || obj.fill === 'var(--primary)')) {
                // Accent shapes
                obj.set('fill', template.accent);
            }
        });

        canvas.renderAll();
        saveCurrentPage();
    }

    function applyTemplateToAllPages(templateId) {
        const template = TEMPLATES_DATA.find(t => t.id === templateId);
        if (!template) return;

        window.selectedTemplateId = templateId;
        window.selectedTemplateDetails = template;

        // 1. Update current canvas active page
        if (canvas) {
            canvas.backgroundColor = template.bg;
            const primaryFont = template.font.replace(/['"]/g, '').split(',')[0].trim();
            canvas.getObjects().forEach(obj => {
                if (obj.type === 'textbox') {
                    obj.set({
                        fontFamily: primaryFont,
                        fill: template.textColor
                    });
                    if (typeof obj.initDimensions === 'function') obj.initDimensions();
                } else if (obj.type === 'rect' && (obj.height <= 8 || obj.fill === '#6C63FF' || obj.fill === 'var(--primary)')) {
                    obj.set('fill', template.accent);
                }
            });
            canvas.renderAll();
            saveCurrentPage();
        }

        // 2. Update all stored page JSONs in canvasPages
        const primaryFont = template.font.replace(/['"]/g, '').split(',')[0].trim();
        canvasPages = canvasPages.map((pageJson, idx) => {
            if (idx === currentCanvasPage) return pageJson; // Current page is already saved above
            try {
                const pageData = JSON.parse(pageJson);
                pageData.background = template.bg;
                if (Array.isArray(pageData.objects)) {
                    pageData.objects.forEach(obj => {
                        if (obj.type === 'textbox') {
                            obj.fontFamily = primaryFont;
                            obj.fill = template.textColor;
                        } else if (obj.type === 'rect' && (obj.height <= 8 || obj.fill === '#6C63FF' || obj.fill === 'var(--primary)')) {
                            obj.fill = template.accent;
                        }
                    });
                }
                return JSON.stringify(pageData);
            } catch (e) {
                console.error("Error updating saved page template: ", e);
                return pageJson;
            }
        });

        alert(`Tema "${template.name}" berhasil diterapkan ke SEMUA ${canvasPages.length} halaman eBook Anda!`);
    }

    document.getElementById('editorTemplateSelector')?.addEventListener('change', (e) => {
        const val = e.target.value;
        const applyAll = confirm(`Apakah Anda ingin menerapkan tema "${val.toUpperCase()}" ke seluruh halaman eBook?\n\n- Klik [OK] untuk menerapkan ke SEMUA halaman.\n- Klik [BATAL] untuk menerapkan ke halaman saat ini saja.`);
        if (applyAll) {
            applyTemplateToAllPages(val);
        } else {
            applyTemplateToCanvas(val);
        }
    });

    // --- PAGE LAYOUT TEMPLATES INJECTION ---
    function applyPageLayout(layoutType) {
        if (!canvas) return alert('Canvas belum siap.');
        if (!confirm('Apakah Anda ingin menerapkan layout baru?\nSemua objek pada halaman saat ini akan dihapus.')) return;

        canvas.clear();
        const template = window.selectedTemplateDetails || TEMPLATES_DATA[0];
        canvas.backgroundColor = template.bg;

        const primaryFont = template.font.replace(/['"]/g, '').split(',')[0].trim();
        const title = window.currentOutlineData?.title || 'Judul eBook Anda';
        const subtitle = window.currentOutlineData?.subtitle || 'Subjudul menarik dari karya Anda';

        if (layoutType === 'cover') {
            // Accent rectangle
            const shape = new fabric.Rect({
                left: 800/2 - 50,
                top: 200,
                width: 100,
                height: 6,
                fill: template.accent,
                rx: 3,
                ry: 3
            });

            const titleText = new fabric.Textbox(title, {
                left: 50,
                top: 240,
                width: 700,
                fontSize: 42,
                fontFamily: primaryFont,
                fontWeight: 800,
                textAlign: 'center',
                fill: template.textColor,
                lineHeight: 1.2
            });

            const subtitleText = new fabric.Textbox(subtitle, {
                left: 70,
                top: 240 + titleText.getScaledHeight() + 30,
                width: 660,
                fontSize: 18,
                fontFamily: primaryFont,
                textAlign: 'center',
                fill: template.textColor,
                opacity: 0.8,
                lineHeight: 1.5
            });

            const authorText = new fabric.Textbox('Penulis: ' + (window.currentUser?.user_metadata?.full_name || 'Nama Anda'), {
                left: 50,
                top: 750,
                width: 700,
                fontSize: 16,
                fontFamily: primaryFont,
                fontWeight: 'bold',
                textAlign: 'center',
                fill: template.accent
            });

            canvas.add(shape, titleText, subtitleText, authorText);

        } else if (layoutType === 'chapter') {
            const badge = new fabric.Textbox('BAB 01', {
                left: 100,
                top: 250,
                width: 600,
                fontSize: 16,
                fontFamily: primaryFont,
                fontWeight: 800,
                fill: template.accent,
                textAlign: 'left'
            });

            const titleText = new fabric.Textbox('Memulai Langkah Pertama', {
                left: 100,
                top: 280,
                width: 600,
                fontSize: 36,
                fontFamily: primaryFont,
                fontWeight: 800,
                fill: template.textColor,
                textAlign: 'left'
            });

            const line = new fabric.Rect({
                left: 100,
                top: 280 + titleText.getScaledHeight() + 20,
                width: 120,
                height: 4,
                fill: template.accent,
                rx: 2,
                ry: 2
            });

            const descText = new fabric.Textbox('Poin pembelajaran utama dari bab ini meliputi fondasi penting yang akan menghemat waktu Anda.', {
                left: 100,
                top: 280 + titleText.getScaledHeight() + 45,
                width: 500,
                fontSize: 15,
                fontFamily: primaryFont,
                fill: template.textColor,
                opacity: 0.8,
                lineHeight: 1.6
            });

            canvas.add(badge, titleText, line, descText);

        } else if (layoutType === 'text-image') {
            const headingText = new fabric.Textbox('Strategi & Solusi Nyata', {
                left: 50,
                top: 120,
                width: 360,
                fontSize: 24,
                fontFamily: primaryFont,
                fontWeight: 800,
                fill: template.textColor,
                textAlign: 'left'
            });

            const bodyText = new fabric.Textbox('Gunakan visual yang mendukung teori Anda agar pembaca tidak bosan. Diagram alir, tabel data, atau ilustrasi sederhana terbukti meningkatkan fokus pembaca digital hingga 40%.\n\nPastikan untuk merangkum poin penting di akhir bagian.', {
                left: 50,
                top: 170,
                width: 360,
                fontSize: 14,
                fontFamily: primaryFont,
                fill: template.textColor,
                lineHeight: 1.6,
                textAlign: 'left'
            });

            const imgPlaceholder = new fabric.Rect({
                left: 450,
                top: 120,
                width: 300,
                height: 400,
                fill: 'rgba(108,99,255,0.05)',
                stroke: 'rgba(108,99,255,0.2)',
                strokeWidth: 2,
                strokeDashArray: [6, 4],
                rx: 8,
                ry: 8
            });

            const placeholderText = new fabric.Textbox('Klik "Unggah Gambar" untuk menaruh visual di sini', {
                left: 470,
                top: 280,
                width: 260,
                fontSize: 13,
                fontFamily: primaryFont,
                fill: template.textColor,
                opacity: 0.6,
                textAlign: 'center'
            });

            canvas.add(headingText, bodyText, imgPlaceholder, placeholderText);

        } else if (layoutType === 'quote') {
            const quoteIcon = new fabric.Path(SVG_ICONS['Quote'], {
                left: 800/2 - 25,
                top: 250,
                fill: template.accent,
                scaleX: 2.5,
                scaleY: 2.5
            });

            const quoteText = new fabric.Textbox('"Tindakan kecil yang nyata jauh lebih berharga daripada seribu rencana besar yang tidak pernah dijalankan."', {
                left: 100,
                top: 330,
                width: 600,
                fontSize: 22,
                fontFamily: primaryFont,
                fontWeight: 'bold',
                fontStyle: 'italic',
                textAlign: 'center',
                fill: template.textColor,
                lineHeight: 1.5
            });

            const authorText = new fabric.Textbox('— Penulis Sukses', {
                left: 100,
                top: 330 + quoteText.getScaledHeight() + 30,
                width: 600,
                fontSize: 15,
                fontFamily: primaryFont,
                fontWeight: 'bold',
                textAlign: 'center',
                fill: template.accent
            });

            canvas.add(quoteIcon, quoteText, authorText);
        } else if (layoutType === 'toc') {
            const headingText = new fabric.Textbox('DAFTAR ISI', {
                left: 100,
                top: 150,
                width: 600,
                fontSize: 32,
                fontFamily: primaryFont,
                fontWeight: 800,
                fill: template.textColor,
                textAlign: 'center'
            });

            const line = new fabric.Rect({
                left: 800/2 - 60,
                top: 150 + headingText.getScaledHeight() + 15,
                width: 120,
                height: 4,
                fill: template.accent,
                rx: 2,
                ry: 2
            });

            let tocLines = [];
            // Dynamically fetch outline or put a beautiful template
            if (window.currentOutlineData && Array.isArray(window.currentOutlineData.outline)) {
                // Limit to first 7 items to avoid overflow, or use a scrollable layout feel
                window.currentOutlineData.outline.slice(0, 7).forEach((item, index) => {
                    let num = String(index + 1).padStart(2, '0');
                    tocLines.push(`${num}. ${item}`);
                });
            } else {
                tocLines = [
                    "01. Fondasi Utama & Mindset Sukses",
                    "02. Cara Cepat Riset Pasar & Niche Potensial",
                    "03. Menulis Tanpa Stuck Menggunakan Framework AI",
                    "04. Teknik Desain eBook yang Memukau di Canvas",
                    "05. Strategi Eksport PDF & Setup Pemasaran",
                    "06. Langkah Nyata Menghasilkan 1 Jam Pertama"
                ];
            }

            const tocContent = tocLines.map(lineText => {
                let base = lineText;
                if (base.length > 50) base = base.substring(0, 47) + '...';
                const dots = '.'.repeat(Math.max(10, 60 - base.length));
                return `${base} ${dots} Hal 0${Math.floor(Math.random() * 5) + (tocLines.indexOf(lineText) * 8) + 2}`;
            }).join('\n\n');

            const tocText = new fabric.Textbox(tocContent, {
                left: 100,
                top: 250,
                width: 600,
                fontSize: 15,
                fontFamily: primaryFont,
                fill: template.textColor,
                lineHeight: 1.8,
                textAlign: 'left'
            });

            canvas.add(headingText, line, tocText);

        } else if (layoutType === 'cta') {
            // Elegant background container box for CTA
            const ctaContainer = new fabric.Rect({
                left: 80,
                top: 150,
                width: 640,
                height: 500,
                fill: template.id === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(108, 99, 255, 0.03)',
                stroke: template.accent,
                strokeWidth: 2,
                rx: 15,
                ry: 15
            });

            const badge = new fabric.Textbox('PROMOSI / CALL TO ACTION', {
                left: 100,
                top: 180,
                width: 600,
                fontSize: 14,
                fontFamily: primaryFont,
                fontWeight: 800,
                fill: template.accent,
                textAlign: 'center'
            });

            const titleText = new fabric.Textbox('LANGKAH NYATA BERIKUTNYA UNTUK ANDA', {
                left: 100,
                top: 210,
                width: 600,
                fontSize: 24,
                fontFamily: primaryFont,
                fontWeight: 800,
                fill: template.textColor,
                textAlign: 'center'
            });

            const descText = new fabric.Textbox('Terima kasih telah membaca eBook ini hingga tuntas. Mengetahui teori saja tidak akan mengubah kondisi finansial Anda—tindakan nyata lah yang menentukan.\n\nJika Anda ingin mendapatkan bimbingan privat 1-on-1, berkonsultasi mengenai strategi bisnis digital Anda, atau mendapatkan penawaran lisensi eksklusif produk ini...', {
                left: 120,
                top: 260,
                width: 560,
                fontSize: 14,
                fontFamily: primaryFont,
                fill: template.textColor,
                lineHeight: 1.6,
                textAlign: 'center',
                opacity: 0.9
            });

            // Simulated premium CTA button
            const buttonRect = new fabric.Rect({
                left: 800/2 - 175,
                top: 450,
                width: 350,
                height: 55,
                fill: '#25D366', // WhatsApp green color
                rx: 10,
                ry: 10,
                shadow: new fabric.Shadow({
                    color: 'rgba(0,0,0,0.15)',
                    blur: 15,
                    offsetX: 0,
                    offsetY: 6
                })
            });

            const buttonText = new fabric.Textbox('💬 HUBUNGI KAMI DI WHATSAPP NOW', {
                left: 800/2 - 175,
                top: 467,
                width: 350,
                fontSize: 14,
                fontFamily: primaryFont,
                fontWeight: 800,
                fill: '#ffffff',
                textAlign: 'center',
                editable: false
            });

            const footerText = new fabric.Textbox('*Dapatkan diskon khusus 50% untuk pembaca eBook edisi terbatas ini!', {
                left: 100,
                top: 530,
                width: 600,
                fontSize: 11,
                fontFamily: primaryFont,
                fontStyle: 'italic',
                fill: template.textColor,
                opacity: 0.6,
                textAlign: 'center'
            });

            canvas.add(ctaContainer, badge, titleText, descText, buttonRect, buttonText, footerText);
        }

        canvas.renderAll();
        saveCurrentPage();
        document.getElementById('layoutSelector').value = '';
    }

    document.getElementById('layoutSelector')?.addEventListener('change', (e) => {
        applyPageLayout(e.target.value);
    });

    // Undo/Redo Button Handlers
    document.getElementById('btnUndo').addEventListener('click', () => {
        if (typeof window.canvasUndo === 'function') window.canvasUndo();
    });
    document.getElementById('btnRedo').addEventListener('click', () => {
        if (typeof window.canvasRedo === 'function') window.canvasRedo();
    });

    // Update color of active object (supports partial text selection)
    document.getElementById('colorPicker').addEventListener('input', (e) => {
        if (!canvas) return;
        const activeObject = canvas.getActiveObject();
        if (activeObject) {
            if (activeObject.type === 'textbox' && activeObject.isEditing) {
                // Apply color only to selected text within the textbox
                const start = activeObject.selectionStart;
                const end = activeObject.selectionEnd;
                if (start !== end) {
                    activeObject.setSelectionStyles({ fill: e.target.value }, start, end);
                } else {
                    // No text selected while editing — change the whole textbox
                    activeObject.set('fill', e.target.value);
                }
            } else {
                activeObject.set('fill', e.target.value);
            }
            canvas.renderAll();
        }
    });

    // Update canvas background color
    const bgColorPicker = document.getElementById('bgColorPicker');
    if (bgColorPicker) {
        bgColorPicker.addEventListener('input', (e) => {
            if (!canvas) return;
            canvas.backgroundColor = e.target.value;
            canvas.renderAll();
        });
    }

    // --- CANVAS BOUNDARY GUIDES ---

    // Margin Guide Toggle
    const btnToggleMarginGuide = document.getElementById('btnToggleMarginGuide');
    if (btnToggleMarginGuide) {
        btnToggleMarginGuide.addEventListener('click', () => {
            const guides = document.getElementById('canvasMarginGuides');
            if (!guides) return;
            const isVisible = guides.classList.toggle('visible');
            btnToggleMarginGuide.classList.toggle('active', isVisible);
        });
    }

    // Ruler Toggle & Drawing
    const btnToggleRuler = document.getElementById('btnToggleRuler');
    if (btnToggleRuler) {
        let rulersDrawn = false;

        function drawRulers() {
            if (rulersDrawn) return;
            rulersDrawn = true;

            const CANVAS_W = 800;
            const CANVAS_H = 1131;

            // Horizontal ruler
            const rulerH = document.getElementById('canvasRulerH');
            if (rulerH) {
                const ctxH = rulerH.getContext('2d');
                ctxH.clearRect(0, 0, CANVAS_W, 20);
                ctxH.fillStyle = 'rgba(15, 23, 42, 0.9)';
                ctxH.fillRect(0, 0, CANVAS_W, 20);

                // Draw tick marks every 50px
                for (let x = 0; x <= CANVAS_W; x += 10) {
                    const isMajor = x % 100 === 0;
                    const isMid = x % 50 === 0;
                    const tickH = isMajor ? 12 : isMid ? 8 : 4;

                    ctxH.beginPath();
                    ctxH.moveTo(x, 20);
                    ctxH.lineTo(x, 20 - tickH);
                    ctxH.strokeStyle = isMajor ? 'rgba(108, 99, 255, 0.8)' : 'rgba(148, 163, 184, 0.4)';
                    ctxH.lineWidth = isMajor ? 1.5 : 0.5;
                    ctxH.stroke();

                    // Labels
                    if (isMajor && x > 0) {
                        ctxH.fillStyle = 'rgba(148, 163, 184, 0.9)';
                        ctxH.font = '8px Outfit, sans-serif';
                        ctxH.textAlign = 'center';
                        ctxH.fillText(x.toString(), x, 8);
                    }
                }
            }

            // Vertical ruler
            const rulerV = document.getElementById('canvasRulerV');
            if (rulerV) {
                const ctxV = rulerV.getContext('2d');
                ctxV.clearRect(0, 0, 20, CANVAS_H);
                ctxV.fillStyle = 'rgba(15, 23, 42, 0.9)';
                ctxV.fillRect(0, 0, 20, CANVAS_H);

                for (let y = 0; y <= CANVAS_H; y += 10) {
                    const isMajor = y % 100 === 0;
                    const isMid = y % 50 === 0;
                    const tickW = isMajor ? 12 : isMid ? 8 : 4;

                    ctxV.beginPath();
                    ctxV.moveTo(20, y);
                    ctxV.lineTo(20 - tickW, y);
                    ctxV.strokeStyle = isMajor ? 'rgba(108, 99, 255, 0.8)' : 'rgba(148, 163, 184, 0.4)';
                    ctxV.lineWidth = isMajor ? 1.5 : 0.5;
                    ctxV.stroke();

                    // Labels
                    if (isMajor && y > 0) {
                        ctxV.save();
                        ctxV.fillStyle = 'rgba(148, 163, 184, 0.9)';
                        ctxV.font = '8px Outfit, sans-serif';
                        ctxV.textAlign = 'center';
                        ctxV.translate(8, y);
                        ctxV.rotate(-Math.PI / 2);
                        ctxV.fillText(y.toString(), 0, 0);
                        ctxV.restore();
                    }
                }
            }
        }

        btnToggleRuler.addEventListener('click', () => {
            const rulerH = document.getElementById('canvasRulerH');
            const rulerV = document.getElementById('canvasRulerV');
            if (!rulerH || !rulerV) return;

            drawRulers();

            const isVisible = rulerH.classList.toggle('visible');
            rulerV.classList.toggle('visible', isVisible);
            btnToggleRuler.classList.toggle('active', isVisible);
        });
    }

    // Font Style / Heading Selector (supports partial text selection)
    document.getElementById('textStyleSelector').addEventListener('change', (e) => {
        const activeObject = canvas.getActiveObject();
        if (activeObject && activeObject.type === 'textbox') {
            const val = e.target.value;
            let styles = {};
            if (val === 'h1') {
                styles = { fontSize: 42, fontWeight: '800' };
            } else if (val === 'h2') {
                styles = { fontSize: 32, fontWeight: '700' };
            } else if (val === 'h3') {
                styles = { fontSize: 24, fontWeight: '600' };
            } else {
                styles = { fontSize: 18, fontWeight: 'normal' };
            }

            if (activeObject.isEditing) {
                const start = activeObject.selectionStart;
                const end = activeObject.selectionEnd;
                if (start !== end) {
                    // Apply only to selected text
                    activeObject.setSelectionStyles(styles, start, end);
                } else {
                    // No text selected while editing — change the whole textbox
                    activeObject.set(styles);
                }
            } else {
                // Not in editing mode — change the whole textbox
                activeObject.set(styles);
            }
            if (typeof activeObject.initDimensions === 'function') activeObject.initDimensions();
            canvas.renderAll();
        }
    });

    // Font Family Selector (supports partial text selection)
    document.getElementById('fontFamilySelector').addEventListener('change', (e) => {
        const activeObject = canvas.getActiveObject();
        if (activeObject && activeObject.type === 'textbox') {
            if (activeObject.isEditing) {
                const start = activeObject.selectionStart;
                const end = activeObject.selectionEnd;
                if (start !== end) {
                    // Apply only to selected text
                    activeObject.setSelectionStyles({ fontFamily: e.target.value }, start, end);
                } else {
                    activeObject.set('fontFamily', e.target.value);
                }
            } else {
                activeObject.set('fontFamily', e.target.value);
            }
            if (typeof activeObject.initDimensions === 'function') activeObject.initDimensions();
            canvas.renderAll();
        }
    });

    // --- FONT SIZE CONTROL ---
    const fontSizeInput = document.getElementById('fontSizeInput');
    const btnFontSizeDown = document.getElementById('btnFontSizeDown');
    const btnFontSizeUp = document.getElementById('btnFontSizeUp');

    // Helper: apply font size to active textbox (selection-aware)
    function applyFontSize(size) {
        if (!canvas) return;
        size = Math.max(8, Math.min(120, size));
        fontSizeInput.value = size;

        const activeObject = canvas.getActiveObject();
        if (activeObject && activeObject.type === 'textbox') {
            if (activeObject.isEditing) {
                const start = activeObject.selectionStart;
                const end = activeObject.selectionEnd;
                if (start !== end) {
                    activeObject.setSelectionStyles({ fontSize: size }, start, end);
                } else {
                    activeObject.set('fontSize', size);
                }
            } else {
                activeObject.set('fontSize', size);
            }
            if (typeof activeObject.initDimensions === 'function') activeObject.initDimensions();
            canvas.renderAll();
        }
    }

    if (fontSizeInput) {
        fontSizeInput.addEventListener('change', (e) => {
            applyFontSize(parseInt(e.target.value) || 18);
        });
        // Also handle Enter key
        fontSizeInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                applyFontSize(parseInt(fontSizeInput.value) || 18);
                fontSizeInput.blur();
            }
        });
    }

    if (btnFontSizeDown) {
        btnFontSizeDown.addEventListener('click', () => {
            const current = parseInt(fontSizeInput.value) || 18;
            applyFontSize(current - 2);
        });
    }

    if (btnFontSizeUp) {
        btnFontSizeUp.addEventListener('click', () => {
            const current = parseInt(fontSizeInput.value) || 18;
            applyFontSize(current + 2);
        });
    }

    // Sync font size input when user selects an object on canvas
    if (canvas) {
        canvas.on('selection:created', syncFontSizeIndicator);
        canvas.on('selection:updated', syncFontSizeIndicator);
    }

    function syncFontSizeIndicator() {
        const activeObject = canvas.getActiveObject();
        if (activeObject && activeObject.type === 'textbox' && fontSizeInput) {
            fontSizeInput.value = Math.round(activeObject.fontSize * (activeObject.scaleX || 1));
        }
    }

    // Keyboard controls for moving objects + Undo/Redo shortcuts
    window.addEventListener('keydown', (e) => {
        // Don't interfere if user is typing in an input or quill editor
        if(e.target.tagName.toLowerCase() === 'input' || e.target.tagName.toLowerCase() === 'textarea' || e.target.closest('.ql-editor') || e.target.tagName.toLowerCase() === 'select') return;
        
        // Undo: Ctrl+Z
        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
            e.preventDefault();
            if (typeof window.canvasUndo === 'function') window.canvasUndo();
            return;
        }
        // Redo: Ctrl+Y or Ctrl+Shift+Z
        if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
            e.preventDefault();
            if (typeof window.canvasRedo === 'function') window.canvasRedo();
            return;
        }

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

                // Tip: If chapters are not on canvas yet, remind user
                if (canvasPages.length <= 1 && window.currentOutlineData && window.currentOutlineData.outline) {
                    const hasChapters = window.currentOutlineData.outline.some(ch => window.chaptersContent[ch] && window.chaptersContent[ch].trim() !== '');
                    if (hasChapters) {
                        alert('💡 Tip: Anda memiliki konten bab yang belum disalin ke Canvas.\n\nGunakan tombol hijau "Salin Semua Bab ke Canvas" di halaman AI Penulis Bab agar konten tampil rapi di PDF.');
                    }
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

    // --- EXPORT DOCX (Word) ---
    document.getElementById('btnExportDOCX').addEventListener('click', () => {
        if (!canvas) return alert('Canvas belum siap.');
        const btn = document.getElementById('btnExportDOCX');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Exporting...';
        btn.disabled = true;

        setTimeout(() => {
            try {
                // Save current chapter if editing
                if (typeof activeChapterElement !== 'undefined' && activeChapterElement && typeof quill !== 'undefined') {
                    window.chaptersContent[activeChapterElement.innerText] = quill.root.innerHTML;
                }

                let htmlBody = '';
                const title = window.currentOutlineData ? window.currentOutlineData.title : 'Ebook';

                // Add chapters content
                if (window.currentOutlineData && window.currentOutlineData.outline) {
                    window.currentOutlineData.outline.forEach(chapterTitle => {
                        const content = window.chaptersContent[chapterTitle];
                        if (content) {
                            htmlBody += `<h2>${chapterTitle}</h2>${content}<br/><br/>`;
                        }
                    });
                }

                if (!htmlBody) {
                    alert('Tidak ada konten bab untuk diekspor. Silakan tulis konten terlebih dahulu.');
                    return;
                }

                const fullHtml = `
                    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
                    <head><meta charset='utf-8'><title>${title}</title>
                    <style>body{font-family:Calibri,sans-serif;font-size:12pt;line-height:1.6;margin:40px;} h2{color:#333;margin-top:30px;} h3{color:#555;} ul{margin-left:20px;} li{margin-bottom:5px;}</style>
                    </head><body><h1>${title}</h1>${htmlBody}</body></html>`;

                const blob = new Blob(['\ufeff', fullHtml], { type: 'application/msword' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = (title || 'Ebook') + '.doc';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            } catch (err) {
                console.error(err);
                alert('Gagal mengekspor Word: ' + err.message);
            } finally {
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        }, 100);
    });

    // --- EXPORT PNG ---
    document.getElementById('btnExportPNG').addEventListener('click', () => {
        if (!canvas) return alert('Canvas belum siap.');
        const btn = document.getElementById('btnExportPNG');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Exporting...';
        btn.disabled = true;

        setTimeout(() => {
            try {
                canvas.discardActiveObject();
                saveCurrentPage();

                const downloadPage = (jsonStr, pageNum) => {
                    return new Promise(resolve => {
                        canvas.loadFromJSON(jsonStr, () => {
                            canvas.renderAll();
                            const dataURL = canvas.toDataURL({ format: 'png', multiplier: 2 });
                            const a = document.createElement('a');
                            a.href = dataURL;
                            a.download = `${window.currentNiche || 'Ebook'}_halaman_${pageNum}.png`;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            resolve();
                        });
                    });
                };

                const exportAllPages = async () => {
                    for (let i = 0; i < canvasPages.length; i++) {
                        await downloadPage(canvasPages[i], i + 1);
                    }
                    // Restore current page
                    loadPage(currentCanvasPage);
                };

                exportAllPages().then(() => {
                    btn.disabled = false;
                    btn.innerHTML = originalText;
                }).catch(err => {
                    console.error(err);
                    alert('Gagal mengekspor PNG: ' + err.message);
                    btn.disabled = false;
                    btn.innerHTML = originalText;
                });
            } catch (err) {
                console.error(err);
                alert('Gagal mengekspor PNG: ' + err.message);
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        }, 100);
    });

    // --- SAVE PROJECT LOGIC ---
    const saveProjectToCloud = async (btnElement) => {
        if(!window.currentUser) return alert('Anda harus login untuk menyimpan.');
        if(!window.currentOutlineData) return alert('Tidak ada data proyek untuk disimpan.');

        btnElement.disabled = true;
        const originalText = btnElement.innerHTML;
        btnElement.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Menyimpan...';

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
                    cta: window.currentCTA || '',
                    audience: window.currentAudience || '',
                    ebookType: window.currentEbookType || 'praktis',
                    selectedTemplateId: window.selectedTemplateId || 'modern'
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

            window._isDirty = false;
            alert('✅ ' + result.message);
        } catch(error) {
            console.error(error);
            if (error.message.includes('JWT expired') || error.message.includes('Unauthorized') || error.message.includes('Sesi')) {
                alert('Sesi Anda telah berakhir. Silakan login kembali untuk menyimpan proyek.');
                localStorage.removeItem('ebookMagicUser');
                window.currentUser = null;
                document.getElementById('authView').style.display = 'flex';
                document.getElementById('mainAppContainer').style.pointerEvents = 'none';
                document.getElementById('mainAppContainer').style.opacity = '0.5';
            } else {
                alert('❌ Gagal menyimpan proyek: ' + error.message);
            }
        } finally {
            btnElement.disabled = false;
            btnElement.innerHTML = originalText;
        }
    };

    const btnSaveProject = document.getElementById('btnSaveProject');
    if(btnSaveProject) {
        btnSaveProject.addEventListener('click', () => saveProjectToCloud(btnSaveProject));
    }
    
    const btnSaveProjectWriter = document.getElementById('btnSaveProjectWriter');
    if(btnSaveProjectWriter) {
        btnSaveProjectWriter.addEventListener('click', () => saveProjectToCloud(btnSaveProjectWriter));
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
                
                const roleBadge = document.getElementById('userRoleBadge');
                if (roleBadge) {
                    let displayName = 'Member Gratis';
                    const r = data.profile.role;
                    if (r === 'owner') displayName = 'Owner / Admin';
                    else if (r === 'super_agency') displayName = 'Super Agency';
                    else if (r === 'agency') displayName = 'Agency VIP';
                    else if (r === 'personal') displayName = 'Member VIP';
                    
                    roleBadge.innerText = displayName;
                }
                
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
                                 <button onclick="changeRole('${u.id}', '${u.role}')" class="btn-ghost" style="padding:4px 8px; font-size: 11px; margin-left: 5px;">Ubah Role</button>
                                 <button onclick="deleteClient('${u.id}')" class="btn-ghost" style="padding:4px 8px; font-size: 11px; margin-left: 5px; color: #ff6b6b;" title="Hapus Klien"><i class="ph ph-trash"></i></button>` : 
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

    window.deleteClient = async function(userId) {
        if (!confirm('Apakah Anda yakin ingin menghapus klien ini secara permanen? Tindakan ini tidak dapat dibatalkan dan semua data ebook klien akan hilang!')) return;
        
        try {
            const res = await fetch(`/api/agency/users/${userId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${window.currentUser.token}` }
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            
            alert('Klien berhasil dihapus secara permanen.');
            loadAgencyUsers();
        } catch (error) {
            console.error(error);
            alert('Gagal: ' + error.message);
        }
    };

    // --- CANVAS CONTEXT MENU ACTIONS ---
    document.getElementById('menuSplitText')?.addEventListener('click', function() {
        document.getElementById('canvasContextMenu').classList.add('hidden');
        const target = window._currentContextMenuTarget;
        if (target && target.type === 'textbox') {
            const text = target.text;
            if (!text || text.length < 5) return alert('Teks terlalu pendek untuk dibelah.');
            
            const lines = text.split('\n');
            if (lines.length > 1) {
                const halfLines = Math.floor(lines.length / 2);
                const text1 = lines.slice(0, halfLines).join('\n');
                const text2 = lines.slice(halfLines).join('\n');
                
                target.set('text', text1);
                if (typeof target.initDimensions === 'function') target.initDimensions();
                
                const newTextBox = new fabric.Textbox(text2, {
                    left: target.left,
                    top: target.top + target.height + 20,
                    width: target.width,
                    fontSize: target.fontSize,
                    fontFamily: target.fontFamily,
                    fontWeight: target.fontWeight,
                    fill: target.fill,
                    lineHeight: target.lineHeight,
                    textAlign: target.textAlign,
                    splitByGrapheme: false
                });
                newTextBox.setControlsVisibility({ mt: false, mb: false });
                
                // If there are objects below the current target, push them down to make room
                const extraSpace = newTextBox.height + 20;
                canvas.getObjects().forEach(obj => {
                    if (obj !== target && obj !== newTextBox && obj.top > target.top + target.height / 2) {
                        obj.set('top', obj.top + extraSpace);
                        obj.setCoords();
                    }
                });

                canvas.add(newTextBox);
                canvas.setActiveObject(newTextBox);
                canvas.renderAll();
                
                if (typeof saveCanvasState === 'function') saveCanvasState();
            } else {
                alert('Tidak ada baris yang bisa dibelah. Coba tambahkan Enter (baris baru) pada teks Anda terlebih dahulu agar sistem tahu di mana harus membelah.');
            }
        }
    });

    document.getElementById('menuInLineWithText')?.addEventListener('click', function() {
        document.getElementById('canvasContextMenu').classList.add('hidden');
        const imgObj = window._currentContextMenuTarget;
        if (imgObj && imgObj.type === 'image') {
            const textboxes = canvas.getObjects().filter(o => o.type === 'textbox');
            if (textboxes.length === 0) return alert('Tidak ada teks di canvas untuk diselaraskan.');
            
            let intersectingText = null;
            // 1. Check for strict intersection
            for (let tb of textboxes) {
                if (imgObj.intersectsWithObject(tb)) {
                    intersectingText = tb;
                    break;
                }
            }
            
            // 2. If no strict intersection, find one that horizontally matches and is vertically close
            if (!intersectingText) {
                for (let tb of textboxes) {
                    if (imgObj.top >= tb.top && imgObj.top <= tb.top + tb.height) {
                        intersectingText = tb;
                        break;
                    }
                }
            }
            
            if (!intersectingText) {
                return alert('Tolong seret (drag) gambar agar menumpuk di atas kotak teks yang ingin dibelah, lalu coba lagi.');
            }
            
            const ratio = Math.max(0.1, Math.min(0.9, (imgObj.top - intersectingText.top) / intersectingText.height));
            const lines = intersectingText.text.split('\n');
            if (lines.length < 2) return alert('Teks ini hanya satu baris, tidak bisa dibelah. Silakan buat baris baru (Enter) terlebih dahulu.');
            
            const splitLineIndex = Math.floor(lines.length * ratio);
            const text1 = lines.slice(0, splitLineIndex).join('\n');
            const text2 = lines.slice(splitLineIndex).join('\n');
            
            intersectingText.set('text', text1);
            if (typeof intersectingText.initDimensions === 'function') intersectingText.initDimensions();
            
            imgObj.set({
                top: intersectingText.top + intersectingText.height + 15,
                left: (800 - imgObj.getScaledWidth()) / 2
            });
            imgObj.setCoords();
            
            const newTextBox = new fabric.Textbox(text2, {
                left: intersectingText.left,
                top: imgObj.top + imgObj.getScaledHeight() + 15,
                width: intersectingText.width,
                fontSize: intersectingText.fontSize,
                fontFamily: intersectingText.fontFamily,
                fontWeight: intersectingText.fontWeight,
                fill: intersectingText.fill,
                lineHeight: intersectingText.lineHeight,
                textAlign: intersectingText.textAlign,
                splitByGrapheme: false
            });
            newTextBox.setControlsVisibility({ mt: false, mb: false });
            canvas.add(newTextBox);
            
            const pushDownAmount = imgObj.getScaledHeight() + newTextBox.height + 30;
            canvas.getObjects().forEach(obj => {
                if (obj !== intersectingText && obj !== imgObj && obj !== newTextBox) {
                    if (obj.top >= intersectingText.top + (intersectingText.height/2)) {
                        obj.set('top', obj.top + pushDownAmount);
                        obj.setCoords();
                    }
                }
            });

            canvas.setActiveObject(imgObj);
            canvas.renderAll();
            if (typeof saveCanvasState === 'function') saveCanvasState();
        }
    });

});
