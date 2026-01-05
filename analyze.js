// ==UserScript==
// @name        Red Team Swiss Army Knife (v4.2 Auditor)
// @namespace   Violentmonkey Scripts
// @match       *://*/*
// @grant       GM_addStyle
// @grant       GM_setClipboard
// @grant       GM_xmlhttpRequest
// @grant       GM_download
// @version     4.2
// @author      (Red Team)
// @description Tự động chấm điểm bảo mật (0-10), đề xuất cải thiện theo chuẩn OWASP, tạo PoC Clickjacking.
// ==/UserScript==

(function() {
    'use strict';

    // --- CONFIG & CONSTANTS ---
    const toolName = "RED TEAM AUDITOR";
    const sidebarId = "rt-stealth-tab-v4";
    const panelId = "rt-hud-panel-v4";

    const secretPatterns = {
        'Google API': /AIza[0-9A-Za-z-_]{35}/g,
        'AWS Access Key': /AKIA[0-9A-Z]{16}/g,
        'Stripe API': /[rs]k_live_[0-9a-zA-Z]{24}/g,
        'GitHub Token': /ghp_[0-9a-zA-Z]{36}/g,
        'Private IP': /(^|\s)192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}/g,
        'Email Address': /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
    };

    // --- STYLES ---
    GM_addStyle(`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700;800&display=swap');

        #${sidebarId} {
            position: fixed; top: 30%; right: 0; transform: translateX(90%); z-index: 9999990;
            background: #0a0a0a; color: #ff0055; padding: 12px 15px;
            border-left: 4px solid #ff0055; border-radius: 6px 0 0 6px;
            font-family: 'JetBrains Mono', monospace; font-weight: bold; cursor: pointer;
            transition: 0.3s cubic-bezier(0.25, 1, 0.5, 1); box-shadow: -5px 0 15px rgba(0,0,0,0.5);
        }
        #${sidebarId}:hover { transform: translateX(0); background: #111; box-shadow: -5px 0 30px rgba(255, 0, 85, 0.4); }

        #${panelId} {
            position: fixed; top: 50px; left: 100px; width: 750px; height: 600px;
            background: #0d0d11; border: 1px solid #333; border-top: 3px solid #ff0055;
            color: #ccc; font-family: 'JetBrains Mono', monospace; font-size: 12px;
            z-index: 9999991; display: none; flex-direction: column;
            box-shadow: 0 30px 100px rgba(0,0,0,0.9); border-radius: 6px;
        }
        #${panelId}.active { display: flex; }

        .rt-header { padding: 12px 20px; background: #111; border-bottom: 1px solid #222; display: flex; justify-content: space-between; align-items: center; cursor: move; }
        .rt-title { font-weight: 800; color: #ff0055; font-size: 14px; text-transform: uppercase; letter-spacing: 1.5px; }

        .rt-tabs { display: flex; background: #16161a; border-bottom: 1px solid #222; }
        .rt-tab { flex: 1; padding: 12px; text-align: center; cursor: pointer; color: #666; transition: 0.2s; border-bottom: 2px solid transparent; font-size: 11px; font-weight: bold; }
        .rt-tab:hover { color: #eee; background: #1f1f25; }
        .rt-tab.active { color: #ff0055; border-bottom-color: #ff0055; background: #0d0d11; }

        .rt-content { flex: 1; overflow-y: auto; padding: 20px; position: relative; }
        .rt-pane { display: none; }
        .rt-pane.active { display: block; }

        .rt-table { width: 100%; border-collapse: collapse; margin-bottom: 10px; font-size: 12px; }
        .rt-table td { padding: 6px 8px; border-bottom: 1px solid #222; vertical-align: top; color: #bbb; }
        .rt-key { color: #888; width: 150px; font-weight: bold; }
        .rt-val { color: #e6e6e6; word-break: break-all; }

        .rt-btn { background: #222; color: #fff; border: 1px solid #444; padding: 6px 12px; cursor: pointer; font-size: 11px; border-radius: 4px; transition: 0.2s; margin-right: 5px; }
        .rt-btn:hover { border-color: #ff0055; color: #ff0055; }
        .rt-btn-poc { background: #330511; border-color: #ff0055; color: #ff0055; width: 100%; padding: 10px; font-weight: bold; margin-top: 10px; }
        .rt-btn-poc:hover { background: #ff0055; color: #000; }

        /* SCORING UI */
        .rt-score-box { display: flex; align-items: center; gap: 20px; margin-bottom: 20px; padding-bottom: 20px; border-bottom: 1px solid #222; }
        .rt-score-circle {
            width: 80px; height: 80px; border-radius: 50%;
            display: flex; justify-content: center; align-items: center;
            font-size: 28px; font-weight: 800; border: 4px solid #333;
        }
        .rt-score-good { border-color: #00ff99; color: #00ff99; box-shadow: 0 0 15px rgba(0,255,153,0.2); }
        .rt-score-avg { border-color: #ffcc00; color: #ffcc00; box-shadow: 0 0 15px rgba(255,204,0,0.2); }
        .rt-score-bad { border-color: #ff0055; color: #ff0055; box-shadow: 0 0 15px rgba(255,0,85,0.2); }

        .rt-issue-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #1a1a1a; }
        .rt-badge { padding: 2px 6px; border-radius: 3px; font-size: 10px; font-weight: bold; color: #000; }
        .rt-bg-crit { background: #ff0055; }
        .rt-bg-high { background: #ff5500; }
        .rt-bg-med { background: #ffcc00; }
        .rt-bg-low { background: #00ccff; }

        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: #111; }
        ::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; }
    `);

    // --- UI BUILDER ---
    const sidebar = document.createElement('div');
    sidebar.id = sidebarId;
    sidebar.innerHTML = `<span>☢️</span> <span>AUDIT</span>`;
    document.body.appendChild(sidebar);

    const panel = document.createElement('div');
    panel.id = panelId;
    panel.innerHTML = `
        <div class="rt-header" id="rt-drag-v4">
            <div class="rt-title">☢️ RED TEAM SECURITY AUDITOR</div>
            <div id="rt-close-v4" style="cursor:pointer; color:#666;">✖</div>
        </div>
        <div class="rt-tabs">
            <div class="rt-tab active" data-target="p-overview">OVERVIEW & SCORE</div>
            <div class="rt-tab" data-target="p-secrets">SECRETS SCAN</div>
            <div class="rt-tab" data-target="p-subdomains">SUBDOMAINS</div>
            <div class="rt-tab" data-target="p-headers">RAW HEADERS</div>
        </div>
        <div class="rt-content">
            <div id="p-overview" class="rt-pane active">Loading Audit...</div>
            <div id="p-secrets" class="rt-pane">
                <button class="rt-btn" id="btn-scan-secrets">▶ START DEEP SCAN (DOM)</button>
                <div id="secret-results" style="margin-top:15px;"></div>
            </div>
            <div id="p-subdomains" class="rt-pane">
                 <button class="rt-btn" id="btn-fetch-subs">▶ FETCH FROM CRT.SH</button>
                 <div id="sub-results" style="margin-top:15px;"></div>
            </div>
            <div id="p-headers" class="rt-pane"></div>
        </div>
    `;
    document.body.appendChild(panel);

    // --- LOGIC: SCORE & AUDIT ALGORITHM ---

    function calculateSecurityScore(headers) {
        let score = 10.0;
        let recommendations = [];
        let clickjackVuln = false;

        // 1. Content-Security-Policy (CSP) - Trọng số: 3.0
        if (!headers['content-security-policy']) {
            score -= 3.0;
            recommendations.push({ level: 'CRITICAL', text: 'Missing Content-Security-Policy (CSP). High risk of XSS.', fix: 'Implement strict CSP header.' });
        } else if (headers['content-security-policy'].includes("'unsafe-inline'") || headers['content-security-policy'].includes("'unsafe-eval'")) {
            score -= 1.5;
            recommendations.push({ level: 'HIGH', text: 'Weak CSP detected (unsafe-inline/eval).', fix: 'Remove unsafe directives from CSP.' });
        }

        // 2. Strict-Transport-Security (HSTS) - Trọng số: 2.0
        if (!headers['strict-transport-security']) {
            score -= 2.0;
            recommendations.push({ level: 'HIGH', text: 'Missing HSTS Header.', fix: 'Enable HSTS to force HTTPS connection.' });
        }

        // 3. Clickjacking Protection (X-Frame / CSP) - Trọng số: 2.0
        const xfo = headers['x-frame-options'];
        const cspFrame = headers['content-security-policy'] && headers['content-security-policy'].includes('frame-ancestors');
        if (!xfo && !cspFrame) {
            score -= 2.0;
            clickjackVuln = true;
            recommendations.push({ level: 'HIGH', text: 'Vulnerable to Clickjacking.', fix: 'Set X-Frame-Options: DENY or CSP frame-ancestors.' });
        }

        // 4. X-Content-Type-Options - Trọng số: 1.0
        if (headers['x-content-type-options'] !== 'nosniff') {
            score -= 1.0;
            recommendations.push({ level: 'MEDIUM', text: 'Missing X-Content-Type-Options: nosniff.', fix: 'Prevent MIME-sniffing attacks.' });
        }

        // 5. Information Leaks (Server / X-Powered-By) - Trọng số: 1.0
        if (headers['server'] || headers['x-powered-by']) {
            score -= 1.0;
            recommendations.push({ level: 'LOW', text: 'Server Information Leak detected.', fix: 'Remove "Server" and "X-Powered-By" headers.' });
        }

        // 6. Referrer Policy - Trọng số: 0.5
        if (!headers['referrer-policy']) {
            score -= 0.5;
            recommendations.push({ level: 'LOW', text: 'Missing Referrer-Policy.', fix: 'Set to "strict-origin-when-cross-origin" to protect user privacy.' });
        }

        // 7. Cookie Security (HttpOnly Check via JS) - Trọng số: 0.5
        const cookies = document.cookie;
        if (cookies && cookies.length > 0) {
            // Note: JS can only see cookies WITHOUT HttpOnly. If we see cookies, they are technically less secure.
            score -= 0.5;
            recommendations.push({ level: 'MEDIUM', text: 'Cookies accessible via JavaScript.', fix: 'Set "HttpOnly" flag for sensitive session cookies.' });
        }

        // Normalize Score
        score = Math.max(0, score).toFixed(1);

        return { score, recommendations, clickjackVuln };
    }

    // --- LOGIC: RENDER ---

    function renderOverview(analysis, headers) {
        const { score, recommendations, clickjackVuln } = analysis;

        let scoreClass = 'rt-score-bad';
        let scoreText = 'CRITICAL';
        if(score >= 8) { scoreClass = 'rt-score-good'; scoreText = 'SECURE'; }
        else if(score >= 5) { scoreClass = 'rt-score-avg'; scoreText = 'WARNING'; }

        const ovDiv = document.getElementById('p-overview');

        let recHtml = '';
        recommendations.forEach(r => {
            let badgeClass = 'rt-bg-low';
            if(r.level === 'CRITICAL') badgeClass = 'rt-bg-crit';
            if(r.level === 'HIGH') badgeClass = 'rt-bg-high';
            if(r.level === 'MEDIUM') badgeClass = 'rt-bg-med';

            recHtml += `
                <div class="rt-issue-row">
                    <div style="flex:1;">
                        <span class="rt-badge ${badgeClass}">${r.level}</span>
                        <span style="color:#ddd; margin-left:8px;">${r.text}</span>
                        <div style="font-size:10px; color:#888; margin-top:2px;">💡 Fix: ${r.fix}</div>
                    </div>
                </div>`;
        });

        let clickjackBtn = '';
        if(clickjackVuln) {
             clickjackBtn = `<button class="rt-btn rt-btn-poc" id="btn-poc-gen">💣 GENERATE CLICKJACK PoC</button>`;
        }

        ovDiv.innerHTML = `
            <div class="rt-score-box">
                <div class="rt-score-circle ${scoreClass}">${score}</div>
                <div>
                    <div style="font-size:18px; font-weight:bold; color:#fff;">SECURITY SCORE</div>
                    <div style="font-size:12px; color:#888;">Evaluation based on OWASP Secure Headers</div>
                    <div style="font-size:12px; font-weight:bold; margin-top:5px;" class="${scoreClass}">RATING: ${scoreText}</div>
                </div>
            </div>

            <div style="margin-bottom:15px; font-weight:bold; color:#fff; text-transform:uppercase; letter-spacing:1px;">🛡️ IMPROVEMENT PLAN</div>
            ${recHtml || '<div style="color:#00ff99; padding:10px;">✅ Excellent! No header-based vulnerabilities found.</div>'}

            ${clickjackBtn}

            <div style="margin-top:20px; border-top:1px solid #333; padding-top:10px;">
                 <table class="rt-table">
                    <tr><td class="rt-key">TARGET HOST</td><td class="rt-val">${window.location.hostname}</td></tr>
                    <tr><td class="rt-key">TOTAL COOKIES</td><td class="rt-val">${document.cookie.split(';').filter(x=>x).length} (Exposed to JS)</td></tr>
                 </table>
            </div>
        `;

        // Re-bind PoC Button
        const btn = document.getElementById('btn-poc-gen');
        if(btn) btn.onclick = generateClickjackPoC;
    }

    // --- HELPER FUNCTIONS (From previous versions) ---
    function generateClickjackPoC() {
        const targetUrl = window.location.href;
        const htmlContent = `<!DOCTYPE html><html><head><title>PoC</title><style>body{text-align:center;background:#f0f0f0;padding:20px;font-family:sans-serif}.wrap{position:relative;width:800px;height:600px;margin:0 auto;border:2px dashed red;overflow:hidden;background:#fff}.decoy{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);padding:20px 40px;background:blue;color:#fff;font-size:24px;font-weight:bold;z-index:1;border:none;border-radius:5px;cursor:pointer}iframe{position:absolute;top:0;left:0;width:100%;height:100%;opacity:0.5;z-index:2;border:none}</style></head><body><h2 style="color:red">⚠️ Clickjacking PoC</h2><p>Target: ${targetUrl}</p><div class="wrap"><button class="decoy">WIN $1,000,000</button><iframe src="${targetUrl}"></iframe></div><p>If you see the site dimmed inside the box, it is VULNERABLE.</p></body></html>`;
        const blob = new Blob([htmlContent], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `poc_clickjack_${window.location.hostname}.html`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    }

    function scanSecrets() {
        const combined = document.body.innerText + " " + document.body.innerHTML;
        let findings = {}, count = 0;
        for (const [name, regex] of Object.entries(secretPatterns)) {
            const matches = [...new Set(combined.match(regex))];
            if (matches.length > 0) { findings[name] = matches; count += matches.length; }
        }
        const resDiv = document.getElementById('secret-results');
        if (count === 0) resDiv.innerHTML = '<div class="rt-success">No obvious secrets found in DOM.</div>';
        else {
            let html = `<div class="rt-danger">⚠️ FOUND ${count} POTENTIAL SECRETS</div>`;
            for (const [type, list] of Object.entries(findings)) {
                html += `<div style="margin-top:10px;"><strong class="rt-warn">${type}:</strong>`;
                list.forEach(m => html += `<div style="font-family:monospace; background:#222; padding:2px 5px; margin:2px 0; color:#fff;">${m.substring(0, 60)}...</div>`);
                html += `</div>`;
            }
            resDiv.innerHTML = html;
        }
    }

    function fetchSubdomains() {
        const domain = window.location.hostname.split('.').slice(-2).join('.');
        const resDiv = document.getElementById('sub-results');
        resDiv.innerHTML = '<div style="color:#aaa;">Contacting crt.sh API...</div>';
        GM_xmlhttpRequest({
            method: "GET", url: `https://crt.sh/?q=%.${domain}&output=json`,
            onload: function(response) {
                try {
                    const data = JSON.parse(response.responseText);
                    const subs = [...new Set(data.map(d => d.name_value))].sort();
                    let html = `<div class="rt-info">FOUND ${subs.length} SUBDOMAINS</div><div style="max-height:300px; overflow-y:auto; margin-top:10px; border:1px solid #333; padding:5px;">`;
                    subs.forEach(s => html += `<div style="padding:2px;"><a href="http://${s.split('\n').join('')}" target="_blank" style="color:#00ccff; text-decoration:none;">${s}</a></div>`);
                    html += `</div>`;
                    resDiv.innerHTML = html;
                } catch(e) { resDiv.innerHTML = '<div class="rt-danger">Error parsing data.</div>'; }
            }
        });
    }

    // --- MAIN ---
    function init() {
        GM_xmlhttpRequest({
            method: "HEAD", url: window.location.href,
            onload: function(response) {
                const h = {};
                response.responseHeaders.trim().split(/[\r\n]+/).forEach(l => {
                    const p = l.split(': '); if(p.length>=2) h[p.shift().toLowerCase()] = p.join(': ');
                });

                // Render Headers Tab
                const hDiv = document.getElementById('p-headers');
                hDiv.innerHTML = `<table class="rt-table">${Object.keys(h).map(k=>`<tr><td class="rt-key">${k}</td><td class="rt-val">${h[k]}</td></tr>`).join('')}</table>`;

                // Calculate & Render Overview
                const analysis = calculateSecurityScore(h);
                renderOverview(analysis, h);
            }
        });
    }

    sidebar.addEventListener('click', () => {
        if(panel.classList.contains('active')) panel.classList.remove('active');
        else { panel.classList.add('active'); init(); }
    });
    document.getElementById('rt-close-v4').onclick = () => panel.classList.remove('active');
    document.querySelectorAll('.rt-tab').forEach(t => {
        t.onclick = function() {
            document.querySelectorAll('.rt-tab').forEach(x => x.classList.remove('active'));
            document.querySelectorAll('.rt-pane').forEach(x => x.classList.remove('active'));
            this.classList.add('active');
            document.getElementById(this.dataset.target).classList.add('active');
        };
    });
    document.getElementById('btn-scan-secrets').onclick = scanSecrets;
    document.getElementById('btn-fetch-subs').onclick = fetchSubdomains;

    // Draggable
    const dragHandle = document.getElementById('rt-drag-v4');
    let isDragging = false, startX, startY, initialLeft, initialTop;
    dragHandle.onmousedown = (e) => {
        isDragging = true; startX = e.clientX; startY = e.clientY; initialLeft = panel.offsetLeft; initialTop = panel.offsetTop;
        document.onmousemove = (e) => { if(!isDragging)return; panel.style.left = (initialLeft + e.clientX - startX) + "px"; panel.style.top = (initialTop + e.clientY - startY) + "px"; };
        document.onmouseup = () => { isDragging = false; document.onmousemove = null; };
    };
})();