        // ============================================
        // Member tools are loaded only after server-side membership verification.
        // ============================================
        let toolsData = {};

        // Pricing tier labels and CSS classes
        const pricingLabels = {
            free: { label: "Free", class: "free" },
            freemium: { label: "Freemium", class: "freemium" },
            paid: { label: "Paid", class: "paid" }
        };

        function escapeHtml(value) {
            return String(value).replace(/[&<>"']/g, character => ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                "\"": "&quot;",
                "'": "&#39;"
            })[character]);
        }

        /**
         * Create HTML for a single tool card
         * @param {Object} tool - Tool data object
         * @param {number} index - Index for staggered animation delay
         * @returns {string} HTML string for the tool card
         */
        function createToolCard(tool, index) {
            const pricing = pricingLabels[tool.pricing] || pricingLabels.freemium;
            // Google favicon service for consistent logos
            const faviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(tool.domain)}&sz=64`;
            const toolUrl = escapeHtml(tool.url);
            const toolName = escapeHtml(tool.name);
            return `
                <article class="tool-card reveal" style="transition-delay: ${Math.min(index, 8) * 32}ms">
                    <div class="tool-card-header">
                        <!-- Tool logo with fallback if favicon fails -->
                        <img src="${faviconUrl}" alt="${escapeHtml(tool.name)} logo" loading="lazy" width="48" height="48">
                        <div class="tool-favicon-fallback" style="display:none; width:48px; height:48px; border-radius:12px; background:var(--gradient-primary); align-items:center; justify-content:center; color:white; font-weight:700; font-size:18px;">${escapeHtml(tool.name.charAt(0))}</div>
                        <!-- Pricing badge -->
                        <span class="tool-badge ${pricing.class}">${pricing.label}</span>
                    </div>
                    <h3 class="tool-name">${toolName}</h3>
                    <p class="tool-desc">${escapeHtml(tool.desc)}</p>
                    <a href="${toolUrl}" target="_blank" rel="noopener noreferrer" class="tool-link">Visit Website <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2-2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></a>
                </article>
            `;
        }

        /**
         * Render all tool cards into their respective category grids
         */
        function renderTools() {
            Object.keys(toolsData).forEach(category => {
                const grid = document.getElementById(`${category}Grid`);
                if (grid) {
                    grid.innerHTML = toolsData[category].map((tool, i) => createToolCard(tool, i)).join('');
                    grid.querySelectorAll('.tool-card-header img').forEach(image => {
                        image.addEventListener('error', () => {
                            image.style.display = 'none';
                            image.nextElementSibling.style.display = 'flex';
                        }, { once: true });
                    });
                }
            });
        }

        window.loadMemberTools = function(data) {
            toolsData = data;
            renderTools();
            document.querySelectorAll('.tool-card.reveal').forEach(el => observer.observe(el));
        };

        /**
         * Animate statistic counters on hero section
         */
        function animateCounters() {
            document.querySelectorAll('.stat-number[data-count]').forEach(el => {
                const target = parseInt(el.dataset.count);
                let current = 0;
                const duration = 2000;
                const step = target / (duration / 16);
                const timer = setInterval(() => {
                    current += step;
                    if (current >= target) {
                        el.textContent = target + (target >= 100 ? '+' : '');
                        clearInterval(timer);
                    } else {
                        el.textContent = Math.floor(current) + (target >= 100 ? '+' : '');
                    }
                }, 16);
            });
        }

        // ============================================
        // SCROLL ANIMATIONS - Intersection Observer
        // ============================================
        const observerOptions = { threshold: 0.08, rootMargin: '0px 0px -20px 0px' };
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                    // Trigger counter animation when hero stats come into view
                    if (entry.target.classList.contains('hero-stats')) {
                        animateCounters();
                    }
                }
            });
        }, observerOptions);

        // ============================================
        // SCROLL EVENT HANDLERS
        // ============================================
        
        /** Update top progress bar based on scroll position */
        function updateProgressBar() {
            const scrollTop = window.scrollY;
            const docHeight = document.documentElement.scrollHeight - window.innerHeight;
            const progress = (scrollTop / docHeight) * 100;
            document.getElementById('progressBar').style.width = `${progress}%`;
        }

        /** Update active nav link based on current scroll section */
        function updateNavOnScroll() {
            const sections = document.querySelectorAll('.category-section');
            const navLinks = document.querySelectorAll('.nav-link');
            let current = '';
            sections.forEach(section => {
                const sectionTop = section.offsetTop - 150;
                if (window.scrollY >= sectionTop) {
                    current = section.getAttribute('id');
                }
            });
            navLinks.forEach(link => {
                link.classList.toggle('active', link.getAttribute('href') === `#${current}`);
            });
            // Add scrolled class to nav for styling
            const nav = document.getElementById('nav');
            nav.classList.toggle('scrolled', window.scrollY > 50);
        }

        // Combined scroll handler for performance
        window.addEventListener('scroll', () => {
            updateProgressBar();
            updateNavOnScroll();
        });

        // ============================================
        // UI INTERACTIONS
        // ============================================
        
        // Mobile menu toggle
        document.getElementById('navToggle').addEventListener('click', function() {
            const navLinks = document.getElementById('navLinks');
            const expanded = this.getAttribute('aria-expanded') === 'true';
            this.setAttribute('aria-expanded', !expanded);
            navLinks.classList.toggle('open');
        });

        // Theme toggle with localStorage persistence
        document.getElementById('themeToggle').addEventListener('click', function() {
            document.body.classList.toggle('dark');
            localStorage.setItem('theme', document.body.classList.contains('dark') ? 'dark' : 'light');
        });

        // Load saved theme on page load
        if (localStorage.getItem('theme') === 'dark') {
            document.body.classList.add('dark');
        }

        // Close mobile menu when clicking a nav link
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', () => {
                document.getElementById('navLinks').classList.remove('open');
                document.getElementById('navToggle').setAttribute('aria-expanded', 'false');
            });
        });

        // Observe all elements with .reveal class for scroll animations
        document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

        // Smooth scroll for anchor links
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function(e) {
                const targetId = this.getAttribute('href');
                if (targetId === '#') return;
                const target = document.querySelector(targetId);
                if (target) {
                    e.preventDefault();
                    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            });
        });
