import { Panel } from './Panel';

/**
 * FlightRadarPanel — Embeds Flightradar24's live flight tracker
 * centered on India. Uses FR24's free embeddable widget.
 */
export class FlightRadarPanel extends Panel {
    private iframe: HTMLIFrameElement | null = null;
    private observer: IntersectionObserver | null = null;
    private isVisible = false;
    private fullscreenBtn: HTMLButtonElement | null = null;
    private isFullscreen = false;

    constructor() {
        super({ id: 'flightradar', title: 'Live Flight Radar', className: 'panel-wide' });
        this.createFullscreenButton();
        this.setupIntersectionObserver();
        this.render();
        document.addEventListener('keydown', this.boundEscHandler);
    }

    private createFullscreenButton(): void {
        this.fullscreenBtn = document.createElement('button');
        this.fullscreenBtn.className = 'live-mute-btn';
        this.fullscreenBtn.title = 'Fullscreen';
        this.fullscreenBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>';
        this.fullscreenBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleFullscreen();
        });
        const header = this.element.querySelector('.panel-header');
        header?.appendChild(this.fullscreenBtn);
    }

    private toggleFullscreen(): void {
        this.isFullscreen = !this.isFullscreen;
        this.element.classList.toggle('live-news-fullscreen', this.isFullscreen);
        document.body.classList.toggle('live-news-fullscreen-active', this.isFullscreen);
        if (this.fullscreenBtn) {
            this.fullscreenBtn.title = this.isFullscreen ? 'Exit fullscreen' : 'Fullscreen';
            this.fullscreenBtn.innerHTML = this.isFullscreen
                ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 14h6v6"/><path d="M20 10h-6V4"/><path d="M14 10l7-7"/><path d="M3 21l7-7"/></svg>'
                : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>';
        }
    }

    private boundEscHandler = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && this.isFullscreen) this.toggleFullscreen();
    };

    private render(): void {
        this.destroyIframe();

        if (!this.isVisible) {
            this.content.innerHTML = '<div class="webcam-placeholder">Flight radar paused — scroll to view</div>';
            return;
        }

        this.content.innerHTML = '';
        this.content.className = 'panel-content webcam-content';

        const wrapper = document.createElement('div');
        wrapper.className = 'webcam-single';
        wrapper.style.cssText = 'width:100%;height:100%;min-height:400px;position:relative;';

        // RadarBox Widget (Reliable free embedding)
        const iframe = document.createElement('iframe');
        iframe.className = 'webcam-iframe';
        // RadarBox provides a dedicated widget URL that is often more permissive than their main domain
        // Focusing on India: 20.5, 78.9 with zoom 5
        iframe.src = 'https://www.radarbox.com/widget?lat=20.5&lng=78.9&z=5&theme=dark&label=0';
        iframe.title = 'RadarBox — Live Flight Radar (India)';
        iframe.allow = 'fullscreen';
        iframe.referrerPolicy = 'no-referrer';
        iframe.style.cssText = 'width:100%;height:100%;min-height:500px;border:none;border-radius:6px;background: #1a1a1a;';
        iframe.setAttribute('loading', 'lazy');

        wrapper.appendChild(iframe);

        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:absolute;bottom:10px;right:10px;z-index:10;';
        overlay.innerHTML = `
            <a href="https://www.radarbox.com/@20.5,78.9,z5" target="_blank" class="live-mute-btn" style="text-decoration:none;font-size:10px;display:flex;align-items:center;gap:4px;background:rgba(0,0,0,0.8);">
                <span>OPEN TACTICAL VIEW</span>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            </a>
        `;
        wrapper.appendChild(overlay);

        this.content.appendChild(wrapper);
        this.iframe = iframe;
    }

    private destroyIframe(): void {
        if (this.iframe) {
            this.iframe.src = 'about:blank';
            this.iframe.remove();
            this.iframe = null;
        }
    }

    private setupIntersectionObserver(): void {
        this.observer = new IntersectionObserver(
            (entries) => {
                const wasVisible = this.isVisible;
                this.isVisible = entries.some(e => e.isIntersecting);
                if (this.isVisible && !wasVisible) {
                    this.render();
                } else if (!this.isVisible && wasVisible) {
                    this.destroyIframe();
                }
            },
            { threshold: 0.1 }
        );
        this.observer.observe(this.element);
    }

    public refresh(): void {
        if (this.isVisible) this.render();
    }

    public destroy(): void {
        document.removeEventListener('keydown', this.boundEscHandler);
        if (this.isFullscreen) this.toggleFullscreen();
        this.observer?.disconnect();
        this.destroyIframe();
        super.destroy();
    }
}
