/**
 * 欧卡2中国电台 - 前端脚本
 */

// DOM 元素
const searchInput = document.getElementById('searchInput');
const provinceSelect = document.getElementById('provinceSelect');
const stationList = document.getElementById('stationList');
const stationElements = stationList ? stationList.querySelectorAll('.station') : [];
const resultCount = document.getElementById('result-count');
const noResults = document.getElementById('noResults');
const quickBtns = document.querySelectorAll('.quick-btn');
const toast = document.getElementById('toast');

// 状态
let activeQuickFilter = '';
let toastTimer = null;

function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 1600);
}

function setActiveStation(url) {
    if (!stationElements || !stationElements.forEach) return;
    stationElements.forEach(station => {
        station.classList.toggle('is-playing', !!url && station.dataset.url === url);
    });
}

/**
 * 搜索过滤电台
 */
function filterStations() {
    if (!stationElements || !searchInput || !provinceSelect) return;

    const searchTerm = searchInput.value.toLowerCase().trim();
    const selectedProvince = provinceSelect.value;
    let visibleCount = 0;

    stationElements.forEach(station => {
        const name = (station.dataset.name || '').toLowerCase();
        const province = station.dataset.province || '';

        const matchSearch = !searchTerm || name.includes(searchTerm);
        const matchProvince = !selectedProvince || province === selectedProvince;
        const matchQuick = !activeQuickFilter || name.includes(activeQuickFilter.toLowerCase());

        if (matchSearch && matchProvince && matchQuick) {
            station.classList.remove('hidden');
            visibleCount++;
        } else {
            station.classList.add('hidden');
        }
    });

    if (resultCount) resultCount.textContent = visibleCount;
    if (noResults) noResults.classList.toggle('show', visibleCount === 0);
}

// 搜索和筛选事件监听
if (searchInput) searchInput.addEventListener('input', filterStations);
if (provinceSelect) provinceSelect.addEventListener('change', filterStations);

// 点击电台卡片：快速播放
if (stationList) {
    stationList.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (btn) return;

        const station = e.target.closest('.station');
        if (!station) return;

        const { url, name, province } = station.dataset;
        if (!url) return;
        playStation(url, name || '-', province || '-');
    });
}

// 快捷过滤按钮
quickBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const filter = btn.dataset.filter || '';
        if (activeQuickFilter === filter) {
            activeQuickFilter = '';
            btn.classList.remove('active');
        } else {
            quickBtns.forEach(b => b.classList.remove('active'));
            activeQuickFilter = filter;
            btn.classList.add('active');
        }
        filterStations();
    });
});

function fallbackCopyText(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    let ok = false;
    try {
        ok = document.execCommand('copy');
    } catch {
        ok = false;
    }
    document.body.removeChild(textarea);
    return ok;
}

/**
 * 复制URL到剪贴板
 * @param {HTMLElement} btn 按钮元素
 * @param {string} url 要复制的URL
 */
function copyUrl(btn, url) {
    const copiedUI = () => {
        if (!btn) return;
        const originalText = btn.textContent;
        btn.textContent = '已复制';
        btn.classList.add('copied');
        setTimeout(() => {
            btn.textContent = originalText;
            btn.classList.remove('copied');
        }, 1200);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(() => {
            copiedUI();
            showToast('链接已复制到剪贴板');
        }).catch(() => {
            const ok = fallbackCopyText(url);
            if (ok) {
                copiedUI();
                showToast('链接已复制到剪贴板');
            } else {
                showToast('复制失败，请手动复制');
                alert('复制失败，请手动复制');
            }
        });
        return;
    }

    const ok = fallbackCopyText(url);
    if (ok) {
        copiedUI();
        showToast('链接已复制到剪贴板');
    } else {
        showToast('复制失败，请手动复制');
        alert('复制失败，请手动复制');
    }
}

/**
 * 播放电台
 * @param {string} url 流地址
 * @param {string} name 电台名称
 * @param {string} province 省份
 */
function playStation(url, name, province) {
    const player = document.getElementById('player');
    const audio = document.getElementById('audioPlayer');
    const playerName = document.getElementById('playerName');
    const playerProvince = document.getElementById('playerProvince');

    if (!player || !audio) return;

    setActiveStation(url);
    if (playerName) playerName.textContent = name || '-';
    if (playerProvince) playerProvince.textContent = province || '-';

    audio.src = url;
    player.classList.add('show');

    audio.play().then(() => {
        showToast(`正在播放：${name || '电台'}`);
    }).catch((err) => {
        console.error('播放失败:', err);
        showToast('播放失败：可能被浏览器拦截（请再点一次播放）');
    });
}

/**
 * 关闭播放器
 */
function closePlayer() {
    const player = document.getElementById('player');
    const audio = document.getElementById('audioPlayer');
    if (!player || !audio) return;

    audio.pause();
    audio.src = '';
    player.classList.remove('show');
    setActiveStation('');
    showToast('已停止播放');
}

// 键盘快捷键
document.addEventListener('keydown', (e) => {
    if (!searchInput) return;

    // 按 / 聚焦搜索框
    if (e.key === '/' && document.activeElement !== searchInput) {
        e.preventDefault();
        searchInput.focus();
    }

    // 按 Escape 清空搜索/筛选
    if (e.key === 'Escape') {
        searchInput.blur();
        searchInput.value = '';
        activeQuickFilter = '';
        quickBtns.forEach(b => b.classList.remove('active'));
        if (provinceSelect) provinceSelect.value = '';
        filterStations();
    }

    // 按空格暂停/播放
    if (e.key === ' ' && document.activeElement.tagName !== 'INPUT') {
        const audio = document.getElementById('audioPlayer');
        if (audio && audio.src) {
            e.preventDefault();
            if (audio.paused) {
                audio.play().catch(() => {});
            } else {
                audio.pause();
            }
        }
    }
});

// 页面加载完成
document.addEventListener('DOMContentLoaded', () => {
    console.log('欧卡2中国电台已加载');
    console.log(`共 ${stationElements.length || 0} 个电台`);
});

// 暴露给 inline onclick
window.copyUrl = copyUrl;
window.playStation = playStation;
window.closePlayer = closePlayer;
