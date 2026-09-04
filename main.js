/**
 * BEX Corporate Site - UX Animations & Interactivity
 * このスクリプトはクライアントサイド（ブラウザ）で動作し、
 * ユーザーのナビゲーション体験（導線）を向上させるアニメーションを提供します。
 */

document.addEventListener('DOMContentLoaded', () => {

    /* 1. Dynamic Sticky Header Animation */
    const header = document.querySelector('.site-header');
    const headerInner = header?.querySelector('.header-inner');
    const mainNav = header?.querySelector('.main-nav');
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isHomePage = document.body.classList.contains('home-page');
    const homeMotionSeenKey = 'bex:home-motion-seen';
    const homeNavigationKey = 'bex:home-navigation';
    const navigationEntry = performance.getEntriesByType('navigation')[0];
    const isReload = navigationEntry?.type === 'reload';
    let skipHomeMotion = false;

    try {
        const arrivedViaHomeLink = sessionStorage.getItem(homeNavigationKey) === '1';
        const hasSeenHomeMotion = sessionStorage.getItem(homeMotionSeenKey) === '1';

        skipHomeMotion = isHomePage && arrivedViaHomeLink && hasSeenHomeMotion && !isReload;

        if (isHomePage) {
            sessionStorage.removeItem(homeNavigationKey);
            sessionStorage.setItem(homeMotionSeenKey, '1');
        }
    } catch {
        // Continue with the normal animation when storage is unavailable.
    }

    document.querySelectorAll('a[href]').forEach(link => {
        link.addEventListener('click', event => {
            if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

            try {
                const href = link.getAttribute('href');
                if (!href || href.startsWith('#')) return;

                const destination = new URL(href, window.location.href);
                const targetsHome = destination.origin === window.location.origin
                    && /\/(?:index\.html)?$/.test(destination.pathname);
                const isHomeSectionLink = isHomePage
                    && destination.pathname === window.location.pathname
                    && destination.hash;

                if (targetsHome && !isHomeSectionLink) {
                    sessionStorage.setItem(homeNavigationKey, '1');
                }
            } catch {
                // Navigation still works when storage is unavailable.
            }
        });
    });

    // Keep the contact route visible on detail pages that use the older header markup.
    if (mainNav && !mainNav.querySelector('.header-contact-btn')) {
        const contactLink = document.createElement('a');
        contactLink.href = 'contact.html';
        contactLink.className = 'header-contact-btn contact-button';
        contactLink.innerHTML = 'お問い合わせ<span class="contact-button__frame" aria-hidden="true"></span>';
        mainNav.appendChild(contactLink);
    }

    // Shared mobile navigation for the top page and existing detail pages.
    if (headerInner && mainNav && !headerInner.querySelector('.menu-toggle')) {
        const menuToggle = document.createElement('button');
        menuToggle.type = 'button';
        menuToggle.className = 'menu-toggle';
        menuToggle.setAttribute('aria-label', 'メニューを開く');
        menuToggle.setAttribute('aria-expanded', 'false');
        menuToggle.innerHTML = '<span></span>';
        headerInner.insertBefore(menuToggle, mainNav);

        const closeMenu = () => {
            mainNav.classList.remove('is-open');
            menuToggle.setAttribute('aria-expanded', 'false');
            menuToggle.setAttribute('aria-label', 'メニューを開く');
        };

        menuToggle.addEventListener('click', () => {
            const isOpen = mainNav.classList.toggle('is-open');
            menuToggle.setAttribute('aria-expanded', String(isOpen));
            menuToggle.setAttribute('aria-label', isOpen ? 'メニューを閉じる' : 'メニューを開く');
        });

        mainNav.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape') closeMenu();
        });
        window.addEventListener('resize', () => {
            if (window.innerWidth > 860) closeMenu();
        });
    }

    /* 2. Back-to-top button */
    const backToTop = document.createElement('button');
    backToTop.type = 'button';
    backToTop.className = 'back-to-top';
    backToTop.textContent = '↑';
    backToTop.setAttribute('aria-label', 'トップへ戻る');
    document.body.appendChild(backToTop);

    const updateScrollState = () => {
        header?.classList.toggle('scrolled', window.scrollY > 50);
        backToTop.classList.toggle('visible', window.scrollY > 400);
    };

    window.addEventListener('scroll', updateScrollState, { passive: true });
    updateScrollState();

    backToTop.addEventListener('click', () => {
        window.scrollTo({
            top: 0,
            behavior: prefersReducedMotion ? 'auto' : 'smooth'
        });
    });

    /* 3. Smooth scrolling for in-page links */
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
                    behavior: prefersReducedMotion ? 'auto' : 'smooth'
                });
            }
        });
    });

    /* 4. Top-page documentary image slider */
    const slider = document.getElementById('heroSlider');
    const sliderTrack = document.getElementById('heroSliderTrack');
    const slides = sliderTrack ? Array.from(sliderTrack.children) : [];
    const previousButton = document.getElementById('sliderPrev');
    const nextButton = document.getElementById('sliderNext');
    const dotsContainer = document.getElementById('sliderDots');

    if (slider && sliderTrack && slides.length > 0) {
        let currentSlide = 0;
        let autoplayTimer;
        const dots = slides.map((_, index) => {
            const dot = document.createElement('button');
            dot.type = 'button';
            dot.className = 'slider-dot';
            dot.setAttribute('aria-label', `${index + 1}枚目の画像を表示`);
            dot.addEventListener('click', () => {
                showSlide(index);
                restartAutoplay();
            });
            dotsContainer?.appendChild(dot);
            return dot;
        });

        const showSlide = index => {
            currentSlide = (index + slides.length) % slides.length;
            sliderTrack.style.transform = `translateX(-${currentSlide * 100}%)`;
            dots.forEach((dot, dotIndex) => {
                const isCurrent = dotIndex === currentSlide;
                dot.classList.toggle('active', isCurrent);
                dot.setAttribute('aria-current', isCurrent ? 'true' : 'false');
            });
        };

        const stopAutoplay = () => window.clearInterval(autoplayTimer);
        const startAutoplay = () => {
            if (!prefersReducedMotion && slides.length > 1) {
                stopAutoplay();
                autoplayTimer = window.setInterval(() => showSlide(currentSlide + 1), 6500);
            }
        };
        const restartAutoplay = () => {
            stopAutoplay();
            startAutoplay();
        };

        previousButton?.addEventListener('click', () => {
            showSlide(currentSlide - 1);
            restartAutoplay();
        });
        nextButton?.addEventListener('click', () => {
            showSlide(currentSlide + 1);
            restartAutoplay();
        });
        slider.parentElement?.addEventListener('mouseenter', stopAutoplay);
        slider.parentElement?.addEventListener('mouseleave', startAutoplay);
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) stopAutoplay();
            else startAutoplay();
        });

        showSlide(0);
        startAutoplay();
    }

    /* ======================================================================
       5. Progressive page and scroll motion (home page only)
       ====================================================================== */
    // Reveal key headings one character at a time while preserving authored
    // line breaks, nested styling and an accessible, unsplit heading label.
    const characterRevealSelectors = [
        '.home-page .hero-title',
        '.home-page .intro-grid > h2',
        '.home-page .display-heading',
        '.home-page .process-grid h3',
        '.home-page .maintenance-copy > h2',
        '.home-page .contact-cta h2'
    ];

    const characterRevealTargets = document.querySelectorAll(characterRevealSelectors.join(', '));

    const prepareCharacterReveal = heading => {
        const accessibleTitle = heading.textContent.trim().replace(/\s+/g, ' ');
        let characterIndex = 0;

        const animateNode = node => {
            if (node.nodeType === Node.TEXT_NODE) {
                const textFragment = document.createDocumentFragment();
                Array.from(node.textContent || '').forEach(character => {
                    const characterElement = document.createElement('span');
                    characterElement.className = 'text-reveal-character';
                    characterElement.textContent = character;
                    characterElement.setAttribute('aria-hidden', 'true');
                    characterElement.style.setProperty('--character-delay', `${90 + characterIndex * 26}ms`);
                    textFragment.appendChild(characterElement);
                    characterIndex += 1;
                });
                return textFragment;
            }

            if (node.nodeName === 'BR') {
                return document.createElement('br');
            }

            if (node.nodeType === Node.ELEMENT_NODE) {
                const elementClone = node.cloneNode(false);
                Array.from(node.childNodes).forEach(child => {
                    elementClone.appendChild(animateNode(child));
                });
                return elementClone;
            }

            return node.cloneNode(true);
        };

        const titleFragment = document.createDocumentFragment();
        Array.from(heading.childNodes).forEach(node => {
            titleFragment.appendChild(animateNode(node));
        });

        heading.replaceChildren(titleFragment);
        heading.setAttribute('aria-label', accessibleTitle);
        heading.classList.add('is-character-animated');
    };

    if (!prefersReducedMotion && !skipHomeMotion) {
        characterRevealTargets.forEach(prepareCharacterReveal);
    }

    const motionGroups = [
        document.querySelectorAll('.intro-grid > *'),
        document.querySelectorAll('.fact-grid > *'),
        document.querySelectorAll('.section-heading-row > *'),
        document.querySelectorAll('.domains-grid > *'),
        document.querySelectorAll('.process-grid > *'),
        document.querySelectorAll('.maintenance-grid > *'),
        document.querySelectorAll('.contact-cta > *')
    ];

    if (isHomePage && !skipHomeMotion && !prefersReducedMotion && 'IntersectionObserver' in window) {
        document.body.classList.add('motion-ready');
        const motionTargets = new Set();

        const characterRevealObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-character-visible');
                    observer.unobserve(entry.target);
                }
            });
        }, { rootMargin: '0px 0px -6% 0px', threshold: 0.2 });

        characterRevealTargets.forEach(heading => {
            if (heading.closest('.hero')) {
                heading.classList.add('is-character-visible');
            } else {
                characterRevealObserver.observe(heading);
            }
        });

        motionGroups.forEach(group => {
            group.forEach((element, index) => {
                element.classList.add('scroll-animate');
                element.style.setProperty('--motion-delay', `${Math.min(index, 4) * 80}ms`);
                motionTargets.add(element);
            });
        });

        document.querySelectorAll('.maintenance-media').forEach(element => {
            element.classList.add('motion-image');
        });

        const motionObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-visible');
                    observer.unobserve(entry.target);
                }
            });
        }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });

        motionTargets.forEach(element => motionObserver.observe(element));

        const homeHero = document.querySelector('.home-hero');
        if (homeHero) {
            let heroMotionFrame = null;
            const updateHeroMotion = () => {
                const heroRect = homeHero.getBoundingClientRect();
                if (heroRect.bottom > 0) {
                    const distance = Math.min(window.scrollY * 0.09, 48);
                    homeHero.style.setProperty('--hero-parallax', `${distance}px`);
                }
                heroMotionFrame = null;
            };

            window.addEventListener('scroll', () => {
                if (heroMotionFrame === null) {
                    heroMotionFrame = window.requestAnimationFrame(updateHeroMotion);
                }
            }, { passive: true });
            updateHeroMotion();
        }
    }

});
