/**
 * BEX Corporate Site - UX Animations & Interactivity
 * このスクリプトはクライアントサイド（ブラウザ）で動作し、
 * ユーザーのナビゲーション体験（導線）を向上させるアニメーションを提供します。
 */

document.addEventListener('DOMContentLoaded', () => {

    /* 1. Dynamic Sticky Header Animation */
    const header = document.querySelector('.site-header');
    const logoImg = document.querySelector('.logo img');
    
    // Set initial transition styles
    if (header) header.style.transition = 'all 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
    if (logoImg) logoImg.style.transition = 'all 0.4s ease';

    function updateHeaderState() {
        if (window.scrollY > 50) {
            if (header) {
                header.classList.add('scrolled');
                header.style.padding = '0.5rem 0';
            }
            if(logoImg) logoImg.style.height = '35px'; // Shrink logo slightly
        } else {
            if (header) {
                header.classList.remove('scrolled');
                header.style.padding = '1rem 0';
            }
            if(logoImg) logoImg.style.height = '45px'; // Original size
        }
    }
    
    window.addEventListener('scroll', updateHeaderState);
    updateHeaderState(); // Run once on load to catch initial scroll position

    /* 2. Animated "Back to Top" Button Generation */
    const backToTop = document.createElement('a');
    backToTop.href = '#';
    backToTop.className = 'back-to-top';
    backToTop.innerHTML = '↑';
    backToTop.setAttribute('aria-label', 'トップへ戻る');
    
    // Set styles dynamically
    Object.assign(backToTop.style, {
        position: 'fixed',
        bottom: '30px',
        right: '30px',
        width: '50px',
        height: '50px',
        backgroundColor: '#003399', // Primary color
        color: 'white',
        borderRadius: '50%',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        fontSize: '1.5rem',
        textDecoration: 'none',
        boxShadow: '0 5px 15px rgba(0,0,0,0.2)',
        opacity: '0',
        visibility: 'hidden',
        transform: 'translateY(20px)',
        transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        zIndex: '999'
    });
    
    // Hover effect
    backToTop.addEventListener('mouseenter', () => {
        backToTop.style.backgroundColor = '#0055ff';
        backToTop.style.transform = 'translateY(-5px) scale(1.1)';
    });
    backToTop.addEventListener('mouseleave', () => {
        backToTop.style.backgroundColor = '#003399';
        backToTop.style.transform = 'translateY(0) scale(1)';
    });

    document.body.appendChild(backToTop);

    window.addEventListener('scroll', () => {
        if (window.scrollY > 400) {
            backToTop.style.opacity = '1';
            backToTop.style.visibility = 'visible';
            backToTop.style.transform = 'translateY(0) scale(1)';
        } else {
            backToTop.style.opacity = '0';
            backToTop.style.visibility = 'hidden';
            backToTop.style.transform = 'translateY(20px) scale(1)';
        }
    });

    backToTop.addEventListener('click', (e) => {
        e.preventDefault();
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });

    /* 3. Smooth Dropdown Animations (Removed - handled by pure CSS in style.css) */

    /* 4. Smooth Scrolling for all anchor links */
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;
            
            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                e.preventDefault();
                const headerOffset = 80;
                const elementPosition = targetElement.getBoundingClientRect().top;
                const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
  
                window.scrollTo({
                    top: offsetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });

    /* ======================================================================
       5. Network Canvas Animation (Interactive Particle System)
       ====================================================================== */
    const canvas = document.getElementById('network-canvas');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        let width, height;
        let particles = [];
        const mouse = { x: null, y: null, radius: 150 };

        function resize() {
            width = canvas.width = window.innerWidth;
            height = canvas.height = document.querySelector('.hero').offsetHeight;
        }
        window.addEventListener('resize', resize);
        resize();

        window.addEventListener('mousemove', (e) => {
            const rect = canvas.getBoundingClientRect();
            if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
                mouse.x = e.x;
                mouse.y = e.y - rect.top;
            } else {
                mouse.x = null;
                mouse.y = null;
            }
        });
        window.addEventListener('mouseout', () => { mouse.x = null; mouse.y = null; });

        class Particle {
            constructor() {
                this.x = Math.random() * width;
                this.y = Math.random() * height;
                this.vx = (Math.random() - 0.5) * 1.5;
                this.vy = (Math.random() - 0.5) * 1.5;
                this.radius = Math.random() * 2 + 1;
            }
            update() {
                this.x += this.vx;
                this.y += this.vy;
                if (this.x < 0 || this.x > width) this.vx = -this.vx;
                if (this.y < 0 || this.y > height) this.vy = -this.vy;

                // Mouse interaction
                if (mouse.x != null && mouse.y != null) {
                    let dx = mouse.x - this.x;
                    let dy = mouse.y - this.y;
                    let distance = Math.sqrt(dx * dx + dy * dy);
                    if (distance < mouse.radius) {
                        const forceDirectionX = dx / distance;
                        const forceDirectionY = dy / distance;
                        const force = (mouse.radius - distance) / mouse.radius;
                        this.vx -= forceDirectionX * force * 0.05;
                        this.vy -= forceDirectionY * force * 0.05;
                    }
                }
                
                // Friction to prevent infinite speed buildup
                this.vx *= 0.99;
                this.vy *= 0.99;
                
                // Minimum speed maintenance
                if(Math.abs(this.vx) < 0.2) this.vx += (this.vx > 0 ? 0.05 : -0.05);
                if(Math.abs(this.vy) < 0.2) this.vy += (this.vy > 0 ? 0.05 : -0.05);
            }
            draw() {
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
                ctx.fill();
            }
        }

        function initParticles() {
            particles = [];
            let numberOfParticles = (width * height) / 15000;
            for (let i = 0; i < numberOfParticles; i++) {
                particles.push(new Particle());
            }
        }

        function animateParticles() {
            ctx.clearRect(0, 0, width, height);
            for (let i = 0; i < particles.length; i++) {
                particles[i].update();
                particles[i].draw();
                for (let j = i; j < particles.length; j++) {
                    let dx = particles[i].x - particles[j].x;
                    let dy = particles[i].y - particles[j].y;
                    let distance = Math.sqrt(dx * dx + dy * dy);
                    if (distance < 120) {
                        ctx.beginPath();
                        ctx.strokeStyle = `rgba(255, 255, 255, ${0.2 - distance/120 * 0.2})`;
                        ctx.lineWidth = 1;
                        ctx.moveTo(particles[i].x, particles[i].y);
                        ctx.lineTo(particles[j].x, particles[j].y);
                        ctx.stroke();
                    }
                }
            }
            requestAnimationFrame(animateParticles);
        }
        initParticles();
        animateParticles();
    }

    /* ======================================================================
       6. Scroll Reveal (Intersection Observer)
       ====================================================================== */
    const revealElements = document.querySelectorAll('.reveal');
    const revealObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
                observer.unobserve(entry.target);
            }
        });
    }, { rootMargin: '0px 0px -100px 0px', threshold: 0.1 });

    revealElements.forEach(el => revealObserver.observe(el));

    /* ======================================================================
       7. Interactive Card Glow (Hover Effects)
       ====================================================================== */
    const glowCards = document.querySelectorAll('.glow-card');
    glowCards.forEach(card => {
        card.addEventListener('mousemove', e => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            card.style.setProperty('--mouse-x', `${x}px`);
            card.style.setProperty('--mouse-y', `${y}px`);
        });
    });
});
