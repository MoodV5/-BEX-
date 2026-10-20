(() => {
    'use strict';

    const form = document.querySelector('[data-contact-form]');
    if (!form) return;
    const button = form.querySelector('[data-contact-submit]');
    const label = button.querySelector('.send-button__label');
    const status = document.getElementById('contact-status');
    const token = form.elements.namedItem('_token');
    let sending = false;

    function feedback(message, state, focus = false) {
        status.textContent = message;
        status.dataset.state = state;
        status.hidden = false;
        if (focus) status.focus({ preventScroll: true });
    }

    async function request(url, options = {}) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 25000);
        try {
            const response = await fetch(url, {
                ...options, credentials: 'same-origin', signal: controller.signal,
                headers: { Accept: 'application/json', ...options.headers },
            });
            const body = await response.json();
            return { response, body };
        } finally {
            clearTimeout(timer);
        }
    }

    async function prepare() {
        if (location.protocol === 'file:') {
            feedback('ファイルを直接開いているため送信できません。PHP対応のWebサーバーでご確認ください。', 'error');
            return;
        }
        try {
            const url = new URL(form.action);
            url.searchParams.set('action', 'token');
            const { response, body } = await request(url);
            if (!response.ok || !body.token) throw new Error('Not ready');
            token.value = body.token;
            button.disabled = false;
        } catch {
            // A server-rendered form already has a valid token and still works without fetch.
            if (token.value) {
                button.disabled = false;
                return;
            }
            feedback('現在フォームを利用できません。時間をおいて再読み込みするか、下記のメール・お電話でお問い合わせください。', 'error');
        }
    }

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (sending || button.disabled || !form.reportValidity()) return;
        sending = true;
        button.disabled = true;
        form.setAttribute('aria-busy', 'true');
        label.textContent = '送信中…';
        form.querySelectorAll('[aria-invalid]').forEach(field => field.removeAttribute('aria-invalid'));
        feedback('送信しています。そのままお待ちください。', 'info');
        try {
            const { response, body } = await request(form.action, { method: 'POST', body: new FormData(form) });
            if (body.token) token.value = body.token;
            if (response.ok && body.ok === true) {
                form.reset();
                token.value = body.token;
                feedback(body.message, 'success', true);
            } else {
                for (const name of Object.keys(body.errors || {})) {
                    form.elements.namedItem(name)?.setAttribute('aria-invalid', 'true');
                }
                feedback(body.message || '送信できませんでした。入力内容をご確認ください。', 'error', true);
            }
        } catch {
            feedback('送信結果を確認できませんでした。入力内容は保持しています。時間をおいて再度お試しいただくか、下記の連絡先へお問い合わせください。', 'error', true);
        } finally {
            sending = false;
            button.disabled = false;
            label.textContent = '送信する';
            form.removeAttribute('aria-busy');
        }
    });

    prepare();
})();
