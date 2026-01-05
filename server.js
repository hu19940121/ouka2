/**
 * 本地流媒体转发服务器
 * 将 m3u8 流转换为 MP3 格式供欧卡2使用
 * 
 * 使用方法：
 * 1. 确保已安装 FFmpeg 并添加到系统 PATH
 * 2. 运行 `npm start` 启动服务器
 * 3. 在欧卡2中使用 http://127.0.0.1:3000/stream/电台ID 作为电台地址
 */
const express = require('express');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// API密钥（用于刷新流地址）
const API_KEY = 'f0fc4c668392f9f9a447e48584c214ee';
const BASE_URL = 'https://ytmsout.radio.cn';

// 加载电台数据
let stations = [];
const stationsPath = path.join(__dirname, 'stations.json');

if (fs.existsSync(stationsPath)) {
    stations = JSON.parse(fs.readFileSync(stationsPath, 'utf-8'));
    console.log(`📻 已加载 ${stations.length} 个电台`);
} else {
    console.warn('⚠️ 未找到 stations.json，请先运行 npm run crawl');
}

// 活动的FFmpeg进程
const activeStreams = new Map();

/**
 * 生成API签名
 */
function generateSign(params, timestamp) {
    const sortedKeys = Object.keys(params).sort();
    const paramStr = sortedKeys.map(key => `${key}=${params[key]}`).join('&');
    let signText = paramStr ?
        `${paramStr}&timestamp=${timestamp}&key=${API_KEY}` :
        `timestamp=${timestamp}&key=${API_KEY}`;
    return crypto.createHash('md5').update(signText).digest('hex').toUpperCase();
}

/**
 * 获取电台的最新流地址（因为地址可能会过期）
 * @param {string} stationId 电台ID
 * @param {object} stationInfo 电台信息（包含province等）
 */
async function refreshStreamUrl(stationId, stationInfo = {}) {
    const timestamp = Date.now();

    // 根据省份确定provinceCode
    const provinceCodeMap = {
        '央广': '0', '国家': '0',
        '安徽': '340000', '北京': '110000', '重庆': '500000', '福建': '350000',
        '甘肃': '620000', '广东': '440000', '广西': '450000', '贵州': '520000',
        '海南': '460000', '河北': '130000', '河南': '410000', '黑龙江': '230000',
        '湖北': '420000', '湖南': '430000', '吉林': '220000', '江苏': '320000',
        '江西': '360000', '辽宁': '210000', '内蒙古': '150000', '宁夏': '640000',
        '青海': '630000', '山东': '370000', '山西': '140000', '陕西': '610000',
        '上海': '310000', '四川': '510000', '西藏': '540000', '新疆': '650000',
        '新疆兵团': '660000', '云南': '530000', '浙江': '330000'
    };

    const provinceCode = provinceCodeMap[stationInfo.province] || '0';
    const params = { categoryId: '0', provinceCode };
    const sign = generateSign(params, timestamp);

    try {
        console.log(`   🔄 正在刷新流地址 (province: ${stationInfo.province || '央广'})...`);

        const response = await fetch(`${BASE_URL}/web/appBroadcast/list?categoryId=0&provinceCode=${provinceCode}`, {
            headers: {
                'equipmentId': '0000',
                'platformCode': 'WEB',
                'Content-Type': 'application/json',
                'timestamp': timestamp.toString(),
                'sign': sign
            }
        });

        const data = await response.json();
        if (data.code === 0 && data.data) {
            const station = data.data.find(s => s.contentId === stationId);
            if (station) {
                const url = station.mp3PlayUrlHigh || station.mp3PlayUrlLow || station.playUrlLow;
                console.log(`   ✅ 获取到新地址`);
                return url;
            }
        }

        // 如果在指定省份没找到，尝试在央广列表中查找
        if (provinceCode !== '0') {
            console.log(`   🔄 在央广列表中查找...`);
            const centralParams = { categoryId: '0', provinceCode: '0' };
            const centralSign = generateSign(centralParams, Date.now());

            const centralResponse = await fetch(`${BASE_URL}/web/appBroadcast/list?categoryId=0&provinceCode=0`, {
                headers: {
                    'equipmentId': '0000',
                    'platformCode': 'WEB',
                    'Content-Type': 'application/json',
                    'timestamp': Date.now().toString(),
                    'sign': centralSign
                }
            });

            const centralData = await centralResponse.json();
            if (centralData.code === 0 && centralData.data) {
                const station = centralData.data.find(s => s.contentId === stationId);
                if (station) {
                    const url = station.mp3PlayUrlHigh || station.mp3PlayUrlLow || station.playUrlLow;
                    console.log(`   ✅ 在央广列表中找到`);
                    return url;
                }
            }
        }

    } catch (err) {
        console.error('   ❌ 刷新流地址失败:', err.message);
    }

    return null;
}

/**
 * 首页 - 显示所有可用电台
 */
app.get('/', (req, res) => {
    // 获取所有省份列表
    const provinces = [...new Set(stations.map(s => s.province || '其他'))].sort((a, b) => {
        if (a === '央广') return -1;
        if (b === '央广') return 1;
        return a.localeCompare(b, 'zh-CN');
    });

    // 生成电台数据JSON供前端使用
    const stationsData = stations.map(s => ({
        id: s.id,
        name: s.name,
        province: s.province || '其他',
        image: s.image || '',
        url: `http://127.0.0.1:${PORT}/stream/${s.id}`
    }));

    let html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>欧卡2中国电台 - 本地转发服务器</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            color: #fff;
            min-height: 100vh;
            padding: 20px;
        }
        h1 { 
            text-align: center; 
            margin-bottom: 10px;
            font-size: 2em;
            background: linear-gradient(45deg, #00d2ff, #3a7bd5);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        .subtitle {
            text-align: center;
            color: #888;
            margin-bottom: 20px;
        }
        .container { max-width: 1400px; margin: 0 auto; }
        
        /* 搜索和筛选区域 */
        .search-area {
            display: flex;
            gap: 15px;
            margin-bottom: 20px;
            flex-wrap: wrap;
            justify-content: center;
            align-items: center;
        }
        .search-box {
            flex: 1;
            min-width: 300px;
            max-width: 500px;
            position: relative;
        }
        .search-box input {
            width: 100%;
            padding: 15px 20px 15px 50px;
            border: 2px solid rgba(255,255,255,0.1);
            border-radius: 50px;
            background: rgba(255,255,255,0.05);
            color: #fff;
            font-size: 1em;
            outline: none;
            transition: all 0.3s;
        }
        .search-box input:focus {
            border-color: #00d2ff;
            background: rgba(0,210,255,0.1);
        }
        .search-box input::placeholder { color: #666; }
        .search-box::before {
            content: "🔍";
            position: absolute;
            left: 20px;
            top: 50%;
            transform: translateY(-50%);
            font-size: 1.2em;
        }
        .province-select {
            padding: 15px 25px;
            border: 2px solid rgba(255,255,255,0.1);
            border-radius: 50px;
            background: rgba(255,255,255,0.05);
            color: #fff;
            font-size: 1em;
            outline: none;
            cursor: pointer;
            min-width: 150px;
        }
        .province-select:focus {
            border-color: #00d2ff;
        }
        .province-select option {
            background: #1a1a2e;
            color: #fff;
        }
        
        /* 统计信息 */
        .stats {
            text-align: center;
            margin-bottom: 20px;
            padding: 15px;
            background: rgba(0,210,255,0.1);
            border-radius: 10px;
            display: flex;
            justify-content: center;
            gap: 30px;
            flex-wrap: wrap;
        }
        .stats span {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        #result-count {
            color: #00d2ff;
            font-weight: bold;
        }
        
        /* 电台列表 */
        .stations {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
            gap: 15px;
        }
        .station {
            background: rgba(255,255,255,0.05);
            border-radius: 12px;
            padding: 15px;
            display: flex;
            align-items: center;
            gap: 15px;
            transition: all 0.3s;
            border: 1px solid rgba(255,255,255,0.1);
            cursor: pointer;
        }
        .station:hover {
            background: rgba(255,255,255,0.1);
            transform: translateY(-3px);
            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
        }
        .station.hidden { display: none; }
        .station img {
            width: 55px;
            height: 55px;
            border-radius: 10px;
            object-fit: cover;
            flex-shrink: 0;
        }
        .station-info { 
            flex: 1; 
            min-width: 0;
        }
        .station-name { 
            font-weight: bold; 
            font-size: 1.05em;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .station-province { 
            color: #00d2ff; 
            font-size: 0.85em;
            margin-top: 2px;
        }
        .station-url {
            font-family: monospace;
            font-size: 0.7em;
            color: #666;
            word-break: break-all;
            margin-top: 5px;
        }
        .station-actions {
            display: flex;
            gap: 8px;
            flex-shrink: 0;
        }
        .btn {
            border: none;
            padding: 10px 15px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 0.85em;
            transition: all 0.2s;
        }
        .btn-copy {
            background: #3a7bd5;
            color: white;
        }
        .btn-copy:hover { background: #2d6bc4; }
        .btn-play {
            background: #28a745;
            color: white;
        }
        .btn-play:hover { background: #218838; }
        .btn.copied {
            background: #28a745 !important;
        }
        
        /* 无结果提示 */
        .no-results {
            text-align: center;
            padding: 60px 20px;
            color: #666;
            font-size: 1.2em;
            display: none;
        }
        .no-results.show { display: block; }
        
        /* 快捷按钮 */
        .quick-filters {
            display: flex;
            gap: 10px;
            justify-content: center;
            margin-bottom: 20px;
            flex-wrap: wrap;
        }
        .quick-btn {
            padding: 8px 16px;
            border: 1px solid rgba(255,255,255,0.2);
            border-radius: 20px;
            background: transparent;
            color: #fff;
            cursor: pointer;
            transition: all 0.2s;
            font-size: 0.9em;
        }
        .quick-btn:hover, .quick-btn.active {
            background: #3a7bd5;
            border-color: #3a7bd5;
        }

        /* 播放器 */
        .player {
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            background: linear-gradient(to top, rgba(0,0,0,0.95), rgba(0,0,0,0.85));
            padding: 15px 20px;
            display: none;
            align-items: center;
            gap: 15px;
            backdrop-filter: blur(10px);
        }
        .player.show { display: flex; }
        .player-info { flex: 1; }
        .player-name { font-weight: bold; }
        .player-province { color: #888; font-size: 0.9em; }
        .player audio { width: 300px; }
        .player-close {
            background: #dc3545;
            color: white;
            border: none;
            padding: 8px 15px;
            border-radius: 5px;
            cursor: pointer;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚛 欧卡2中国电台</h1>
        <p class="subtitle">本地流媒体转发服务器 - 将云听电台m3u8流转换为欧卡2可用格式</p>
        
        <div class="search-area">
            <div class="search-box">
                <input type="text" id="searchInput" placeholder="搜索电台名称..." autocomplete="off">
            </div>
            <select class="province-select" id="provinceSelect">
                <option value="">全部地区 (${stations.length})</option>
                ${provinces.map(p => `<option value="${p}">${p} (${stations.filter(s => (s.province || '其他') === p).length})</option>`).join('')}
            </select>
        </div>
        
        <div class="quick-filters">
            <button class="quick-btn" data-filter="新闻">📰 新闻</button>
            <button class="quick-btn" data-filter="音乐">🎵 音乐</button>
            <button class="quick-btn" data-filter="交通">🚗 交通</button>
            <button class="quick-btn" data-filter="经济">💰 经济</button>
            <button class="quick-btn" data-filter="文艺">🎭 文艺</button>
            <button class="quick-btn" data-filter="生活">🏠 生活</button>
        </div>
        
        <div class="stats">
            <span>📻 总电台: <strong>${stations.length}</strong> 个</span>
            <span>🔍 显示: <strong id="result-count">${stations.length}</strong> 个</span>
            <span>🌐 服务器: <strong>http://127.0.0.1:${PORT}</strong></span>
        </div>
        
        <div class="stations" id="stationList">
            ${stationsData.map(s => `
            <div class="station" data-name="${s.name}" data-province="${s.province}" data-url="${s.url}">
                <img src="${s.image || 'https://via.placeholder.com/55/1a1a2e/666?text=📻'}" alt="${s.name}" onerror="this.src='https://via.placeholder.com/55/1a1a2e/666?text=📻'">
                <div class="station-info">
                    <div class="station-name">${s.name}</div>
                    <div class="station-province">${s.province}</div>
                    <div class="station-url">${s.url}</div>
                </div>
                <div class="station-actions">
                    <button class="btn btn-play" onclick="playStation('${s.url}', '${s.name.replace(/'/g, "\\'")}', '${s.province}')">▶</button>
                    <button class="btn btn-copy" onclick="copyUrl(this, '${s.url}')">复制</button>
                </div>
            </div>
            `).join('')}
        </div>
        
        <div class="no-results" id="noResults">
            😕 没有找到匹配的电台，试试其他关键词？
        </div>
    </div>
    
    <div class="player" id="player">
        <div class="player-info">
            <div class="player-name" id="playerName">-</div>
            <div class="player-province" id="playerProvince">-</div>
        </div>
        <audio id="audioPlayer" controls></audio>
        <button class="player-close" onclick="closePlayer()">✕ 关闭</button>
    </div>

<script>
const searchInput = document.getElementById('searchInput');
const provinceSelect = document.getElementById('provinceSelect');
const stationList = document.getElementById('stationList');
const stations = stationList.querySelectorAll('.station');
const resultCount = document.getElementById('result-count');
const noResults = document.getElementById('noResults');
const quickBtns = document.querySelectorAll('.quick-btn');

let activeQuickFilter = '';

// 搜索过滤
function filterStations() {
    const searchTerm = searchInput.value.toLowerCase().trim();
    const selectedProvince = provinceSelect.value;
    let visibleCount = 0;
    
    stations.forEach(station => {
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

// 事件监听
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

// 复制URL
function copyUrl(btn, url) {
    navigator.clipboard.writeText(url).then(() => {
        const originalText = btn.textContent;
        btn.textContent = '已复制!';
        btn.classList.add('copied');
        setTimeout(() => {
            btn.textContent = originalText;
            btn.classList.remove('copied');
        }, 1500);
    });
}

// 播放电台
function playStation(url, name, province) {
    const player = document.getElementById('player');
    const audio = document.getElementById('audioPlayer');
    const playerName = document.getElementById('playerName');
    const playerProvince = document.getElementById('playerProvince');
    
    playerName.textContent = name;
    playerProvince.textContent = province;
    audio.src = url;
    audio.play();
    player.classList.add('show');
}

// 关闭播放器
function closePlayer() {
    const player = document.getElementById('player');
    const audio = document.getElementById('audioPlayer');
    audio.pause();
    audio.src = '';
    player.classList.remove('show');
}

// 键盘快捷键
document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== searchInput) {
        e.preventDefault();
        searchInput.focus();
    }
    if (e.key === 'Escape') {
        searchInput.blur();
        searchInput.value = '';
        filterStations();
    }
});
</script>
</body>
</html>`;

    res.send(html);
});

/**
 * 电台列表API（JSON格式）
 */
app.get('/api/stations', (req, res) => {
    const stationsWithUrls = stations.map(s => ({
        ...s,
        localStreamUrl: `http://127.0.0.1:${PORT}/stream/${s.id}`
    }));
    res.json(stationsWithUrls);
});

/**
 * 流媒体转发端点
 * 使用FFmpeg将m3u8转换为MP3流
 */
app.get('/stream/:id', async (req, res) => {
    const stationId = req.params.id;
    const station = stations.find(s => s.id === stationId);

    if (!station) {
        return res.status(404).send('电台未找到');
    }

    console.log(`🎵 开始转发: ${station.name}`);

    // 实时获取最新的流地址（解决地址过期问题）
    let streamUrl = await refreshStreamUrl(stationId, station);

    // 如果刷新失败，使用缓存的地址作为后备
    if (!streamUrl) {
        console.log(`   ⚠️ 刷新失败，使用缓存地址`);
        streamUrl = station.mp3PlayUrlHigh || station.mp3PlayUrlLow || station.playUrlLow;
    }

    if (!streamUrl) {
        console.log(`   ❌ 无可用流地址`);
        return res.status(500).send('无可用流地址');
    }

    console.log(`   📡 流地址: ${streamUrl.substring(0, 80)}...`);

    // 设置响应头
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    // icy-name 使用 URL 编码来支持中文（某些播放器可解码）
    res.setHeader('icy-name', encodeURIComponent(station.name));

    // 启动FFmpeg进程 - 优化参数以提高稳定性
    const ffmpeg = spawn('ffmpeg', [
        '-reconnect', '1',           // 断开时自动重连
        '-reconnect_streamed', '1',  // 流媒体重连
        '-reconnect_delay_max', '5', // 最大重连延迟5秒
        '-i', streamUrl,
        '-vn',                       // 不处理视频
        '-acodec', 'libmp3lame',
        '-ab', '128k',
        '-ar', '44100',
        '-ac', '2',
        '-f', 'mp3',
        '-fflags', '+nobuffer+discardcorrupt',
        '-flags', 'low_delay',
        '-flush_packets', '1',
        'pipe:1'
    ], {
        stdio: ['pipe', 'pipe', 'pipe']
    });

    // 记录活动流
    activeStreams.set(stationId, ffmpeg);

    // 将FFmpeg输出传输到响应
    ffmpeg.stdout.pipe(res);

    // 收集FFmpeg错误输出用于调试
    let ffmpegErrors = '';
    ffmpeg.stderr.on('data', (data) => {
        ffmpegErrors += data.toString();
        // 取消下面的注释可以看到详细的FFmpeg日志
        // console.log(`FFmpeg: ${data}`);
    });

    ffmpeg.on('error', (err) => {
        console.error(`   ❌ FFmpeg错误: ${err.message}`);
        activeStreams.delete(stationId);
    });

    ffmpeg.on('close', (code) => {
        if (code !== 0 && code !== null) {
            console.log(`🔇 ${station.name} 流已关闭 (code: ${code})`);
            // 如果异常退出，打印最后的错误信息
            const lastErrors = ffmpegErrors.split('\n').slice(-5).join('\n');
            if (lastErrors.trim()) {
                console.log(`   最后错误: ${lastErrors.substring(0, 200)}`);
            }
        } else {
            console.log(`🔇 ${station.name} 流正常关闭`);
        }
        activeStreams.delete(stationId);
    });

    // 客户端断开时关闭FFmpeg
    req.on('close', () => {
        console.log(`👋 客户端断开: ${station.name}`);
        ffmpeg.kill('SIGTERM');
        activeStreams.delete(stationId);
    });
});

/**
 * 健康检查
 */
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        stations: stations.length,
        activeStreams: activeStreams.size
    });
});

// 启动服务器
app.listen(PORT, () => {
    console.log('\n====================================');
    console.log('  欧卡2中国电台 - 本地转发服务器');
    console.log('====================================');
    console.log(`\n🚀 服务器已启动: http://127.0.0.1:${PORT}`);
    console.log(`📻 可用电台: ${stations.length} 个`);
    console.log(`\n📝 使用说明:`);
    console.log(`   1. 访问 http://127.0.0.1:${PORT} 查看所有电台`);
    console.log(`   2. 在欧卡2中使用 http://127.0.0.1:${PORT}/stream/电台ID`);
    console.log(`   3. 运行 npm run generate 生成欧卡2配置文件`);
    console.log('\n⚠️  确保FFmpeg已安装并添加到系统PATH！');
    console.log('====================================\n');
});
