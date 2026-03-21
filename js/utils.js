// utils.js - Shared utilities
const Toast = {
    show(message, type = 'info') {
        const container = document.querySelector('.toast-container') || this.createContainer();
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        const icon = type === 'success' ? 'fa-check-circle' : (type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle');
        
        toast.innerHTML = `
            <i class="fas ${icon}"></i>
            <span>${message}</span>
        `;
        
        container.appendChild(toast);
        
        setTimeout(() => {
            toast.classList.add('hide');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    },
    createContainer() {
        const container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
        return container;
    },
    success(msg) { this.show(msg, 'success'); },
    error(msg) { this.show(msg, 'error'); },
    warn(msg) { this.show(msg, 'warning'); }
};

const showLoader = () => {
    const loader = document.createElement('div');
    loader.className = 'loader-wrapper';
    loader.id = 'globalLoader';
    loader.innerHTML = '<span class="loader"></span>';
    document.body.appendChild(loader);
};

const hideLoader = () => {
    const loader = document.getElementById('globalLoader');
    if (loader) {
        loader.style.opacity = '0';
        setTimeout(() => loader.remove(), 400);
    }
};

window.Toast = Toast;
window.showLoader = showLoader;
window.hideLoader = hideLoader;
