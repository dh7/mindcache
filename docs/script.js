// Interactive functionality for MindCache website

// Copy to clipboard functionality
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showToast('Copied to clipboard!');
    }).catch(() => {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showToast('Copied to clipboard!');
    });
}

// Show toast notification
function showToast(message) {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toast-message');
    
    toastMessage.textContent = message;
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Copy install command
function copyInstallCommand() {
    copyToClipboard('npm install mindcache');
}

// Example tabs functionality
function showExample(exampleId) {
    // Hide all examples
    const examples = document.querySelectorAll('.example');
    examples.forEach(example => {
        example.classList.remove('active');
    });
    
    // Remove active class from all tabs
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Show selected example
    const selectedExample = document.getElementById(`example-${exampleId}`);
    if (selectedExample) {
        selectedExample.classList.add('active');
    }
    
    // Add active class to clicked tab
    event.target.classList.add('active');
}

// Smooth scrolling for anchor links
document.addEventListener('DOMContentLoaded', function() {
    const links = document.querySelectorAll('a[href^="#"]');
    
    links.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            
            const targetId = this.getAttribute('href').substring(1);
            const targetElement = document.getElementById(targetId);
            
            if (targetElement) {
                const headerOffset = 80; // Account for fixed header
                const elementPosition = targetElement.getBoundingClientRect().top;
                const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
                
                window.scrollTo({
                    top: offsetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });
});


// Navbar scroll effect
window.addEventListener('scroll', function() {
    const nav = document.querySelector('.nav');
    
    if (window.scrollY > 50) {
        nav.style.background = 'rgba(255, 255, 255, 0.95)';
        nav.style.boxShadow = '0 1px 3px 0 rgb(0 0 0 / 0.1)';
    } else {
        nav.style.background = 'rgba(255, 255, 255, 0.8)';
        nav.style.boxShadow = 'none';
    }
});

// Add intersection observer for animations
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, observerOptions);

// Observe elements for animation
document.addEventListener('DOMContentLoaded', function() {
    const animatedElements = document.querySelectorAll('.feature-card, .doc-card, .step');
    
    animatedElements.forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(20px)';
        el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(el);
    });
});

// Add loading states for better UX
function addLoadingStates() {
    const buttons = document.querySelectorAll('.btn-primary, .btn-secondary');
    
    buttons.forEach(button => {
        button.addEventListener('click', function(e) {
            // Don't add loading state for copy buttons
            if (this.onclick && this.onclick.toString().includes('copy')) {
                return;
            }
            
            const originalText = this.innerHTML;
            this.innerHTML = '<span>Loading...</span>';
            this.disabled = true;
            
            // Reset after 2 seconds (adjust as needed)
            setTimeout(() => {
                this.innerHTML = originalText;
                this.disabled = false;
            }, 2000);
        });
    });
}

// Initialize loading states
document.addEventListener('DOMContentLoaded', addLoadingStates);

// Add keyboard navigation support
document.addEventListener('keydown', function(e) {
    // Press 'c' to copy install command
    if (e.key === 'c' && !e.ctrlKey && !e.metaKey && !e.target.matches('input, textarea')) {
        e.preventDefault();
        copyInstallCommand();
    }
    
    // Press 'Escape' to close any open modals/toasts
    if (e.key === 'Escape') {
        const toast = document.getElementById('toast');
        if (toast.classList.contains('show')) {
            toast.classList.remove('show');
        }
    }
});

// Add search functionality (for future enhancement)
function initSearch() {
    // This could be expanded to search through documentation
    // For now, it's a placeholder for future functionality
    console.log('Search functionality initialized');
}

// Performance optimization: Lazy load images if any are added
function lazyLoadImages() {
    const images = document.querySelectorAll('img[data-src]');
    
    if ('IntersectionObserver' in window) {
        const imageObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    img.src = img.dataset.src;
                    img.classList.remove('lazy');
                    imageObserver.unobserve(img);
                }
            });
        });
        
        images.forEach(img => imageObserver.observe(img));
    } else {
        // Fallback for browsers without IntersectionObserver
        images.forEach(img => {
            img.src = img.dataset.src;
        });
    }
}

// Initialize all functionality
document.addEventListener('DOMContentLoaded', function() {
    initSearch();
    lazyLoadImages();
    
    // Add some visual feedback for interactive elements
    const interactiveElements = document.querySelectorAll('button, .btn-primary, .btn-secondary, .doc-card, .feature-card');
    
    interactiveElements.forEach(el => {
        el.addEventListener('mouseenter', function() {
            this.style.cursor = 'pointer';
        });
    });
});

// Add analytics event tracking (placeholder)
function trackEvent(eventName, properties = {}) {
    // This would integrate with your analytics service
    console.log(`Event: ${eventName}`, properties);
    
    // Example: Google Analytics 4
    // gtag('event', eventName, properties);
    
    // Example: Mixpanel
    // mixpanel.track(eventName, properties);
}

// Track important user interactions
document.addEventListener('DOMContentLoaded', function() {
    // Track copy install command
    const installBtn = document.querySelector('.btn-primary');
    if (installBtn && installBtn.onclick) {
        installBtn.addEventListener('click', () => {
            trackEvent('install_command_copied', {
                package: 'mindcache',
                source: 'hero_button'
            });
        });
    }
    
    // Track example tab clicks
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const exampleType = e.target.textContent.toLowerCase().replace(' ', '_');
            trackEvent('example_viewed', {
                example_type: exampleType
            });
        });
    });
    
    // Track documentation link clicks
    const docCards = document.querySelectorAll('.doc-card');
    docCards.forEach(card => {
        card.addEventListener('click', (e) => {
            const docType = card.querySelector('h3').textContent.toLowerCase().replace(' ', '_');
            trackEvent('documentation_clicked', {
                doc_type: docType
            });
        });
    });
});
