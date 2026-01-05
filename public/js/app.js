/**
 * 欧卡2中国电台 - 前端脚本
 */

// DOM 元素
const searchInput = document.getElementById('searchInput');
const provinceSelect = document.getElementById('provinceSelect');
const stationList = document.getElementById('stationList');
const stationElements = stationList.querySelectorAll('.station');
const resultCount = document.getElementById('result-count');
const noResults = document.getElementById('noResults');
const quickBtns = document.querySelectorAll('.quick-btn');

// 状态
let activeQuickFilter = '';

/**
 * 搜索过滤电台
 */
function filterStations() {
    const searchTerm = searchInput.value.toLowerCase().trim();
    const selectedProvince = provinceSelect.value;
    let visibleCount = 0;

    stationElements.forEach(station => {
        const name = station.dataset.name.toLowerCase();
        const province = station.dataset.province;

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

    resultCount.textContent = visibleCount;
    noResults.classList.toggle('show', visibleCount === 0);
}

// 搜索和筛选事件监听
searchInput.addEventListener('input', filterStations);
provinceSelect.addEventListener('change', filterStations);

// 快捷过滤按钮
quickBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const filter = btn.dataset.filter;
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

/**
 * 复制URL到剪贴板
 * @param {HTMLElement} btn 按钮元素
 * @param {string} url 要复制的URL
 */
function copyUrl(btn, url) {
    navigator.clipboard.writeText(url).then(() => {
        const originalText = btn.textContent;
        btn.textContent = '已复制!';
        btn.classList.add('copied');
        setTimeout(() => {
            btn.textContent = originalText;
            btn.classList.remove('copied');
        }, 1500);
    }).catch(err => {
        console.error('复制失败:', err);
        alert('复制失败，请手动复制');
    });
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

    playerName.textContent = name;
    playerProvince.textContent = province;
    audio.src = url;
    audio.play().catch(err => {
        console.error('播放失败:', err);
    });
    player.classList.add('show');
}

/**
 * 关闭播放器
 */
function closePlayer() {
    const player = document.getElementById('player');
    const audio = document.getElementById('audioPlayer');
    audio.pause();
    audio.src = '';
    player.classList.remove('show');
}

// 键盘快捷键
document.addEventListener('keydown', (e) => {
    // 按 / 聚焦搜索框
    if (e.key === '/' && document.activeElement !== searchInput) {
        e.preventDefault();
        searchInput.focus();
    }
    // 按 Escape 清空搜索
    if (e.key === 'Escape') {
        searchInput.blur();
        searchInput.value = '';
        activeQuickFilter = '';
        quickBtns.forEach(b => b.classList.remove('active'));
        filterStations();
    }
    // 按空格暂停/播放
    if (e.key === ' ' && document.activeElement.tagName !== 'INPUT') {
        const audio = document.getElementById('audioPlayer');
        if (audio.src) {
            e.preventDefault();
            if (audio.paused) {
                audio.play();
            } else {
                audio.pause();
            }
        }
    }
});

// 页面加载完成
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚛 欧卡2中国电台已加载');
    console.log(`📻 共 ${stationElements.length} 个电台`);
});
