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
 */
async function refreshStreamUrl(stationId) {
    const timestamp = Date.now();
    const params = { categoryId: '0', provinceCode: '0' };
    const sign = generateSign(params, timestamp);

    try {
        const response = await fetch(`${BASE_URL}/web/appBroadcast/list?categoryId=0&provinceCode=0`, {
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
                return station.mp3PlayUrlHigh || station.mp3PlayUrlLow || station.playUrlLow;
            }
        }
    } catch (err) {
        console.error('刷新流地址失败:', err.message);
    }

    return null;
}

/**
 * 首页 - 显示所有可用电台
 */
app.get('/', (req, res) => {
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
            margin-bottom: 30px;
        }
        .container { max-width: 1200px; margin: 0 auto; }
        .stations {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 15px;
        }
        .station {
            background: rgba(255,255,255,0.05);
            border-radius: 10px;
            padding: 15px;
            display: flex;
            align-items: center;
            gap: 15px;
            transition: all 0.3s;
            border: 1px solid rgba(255,255,255,0.1);
        }
        .station:hover {
            background: rgba(255,255,255,0.1);
            transform: translateY(-2px);
        }
        .station img {
            width: 60px;
            height: 60px;
            border-radius: 8px;
            object-fit: cover;
        }
        .station-info { flex: 1; }
        .station-name { font-weight: bold; font-size: 1.1em; }
        .station-province { color: #888; font-size: 0.9em; }
        .station-url {
            font-family: monospace;
            font-size: 0.75em;
            color: #00d2ff;
            word-break: break-all;
            margin-top: 5px;
        }
        .copy-btn {
            background: #3a7bd5;
            color: white;
            border: none;
            padding: 8px 15px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 0.9em;
        }
        .copy-btn:hover { background: #2d6bc4; }
        .stats {
            text-align: center;
            margin-bottom: 20px;
            padding: 15px;
            background: rgba(0,210,255,0.1);
            border-radius: 10px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚛 欧卡2中国电台</h1>
        <p class="subtitle">本地流媒体转发服务器 - 将云听电台m3u8流转换为欧卡2可用格式</p>
        
        <div class="stats">
            <strong>📻 可用电台: ${stations.length} 个</strong> | 
            <strong>🌐 服务器地址: http://127.0.0.1:${PORT}</strong>
        </div>
        
        <div class="stations">
`;

    // 按省份分组
    const grouped = {};
    for (const station of stations) {
        const province = station.province || '其他';
        if (!grouped[province]) grouped[province] = [];
        grouped[province].push(station);
    }

    // 优先显示央广
    const sortedProvinces = Object.keys(grouped).sort((a, b) => {
        if (a === '央广') return -1;
        if (b === '央广') return 1;
        return a.localeCompare(b, 'zh-CN');
    });

    for (const station of stations) {
        const streamUrl = `http://127.0.0.1:${PORT}/stream/${station.id}`;
        html += `
            <div class="station">
                <img src="${station.image || 'https://via.placeholder.com/60'}" alt="${station.name}" onerror="this.src='https://via.placeholder.com/60'">
                <div class="station-info">
                    <div class="station-name">${station.name}</div>
                    <div class="station-province">${station.province}</div>
                    <div class="station-url">${streamUrl}</div>
                </div>
                <button class="copy-btn" onclick="navigator.clipboard.writeText('${streamUrl}')">复制</button>
            </div>
        `;
    }

    html += `
        </div>
    </div>
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

    // 使用保存的流地址（可能需要刷新）
    let streamUrl = station.mp3PlayUrlHigh || station.mp3PlayUrlLow || station.playUrlLow;

    if (!streamUrl) {
        return res.status(500).send('无可用流地址');
    }

    console.log(`🎵 开始转发: ${station.name}`);
    console.log(`   源地址: ${streamUrl}`);

    // 设置响应头
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    // icy-name 使用 URL 编码来支持中文（某些播放器可解码）
    res.setHeader('icy-name', encodeURIComponent(station.name));

    // 启动FFmpeg进程
    const ffmpeg = spawn('ffmpeg', [
        '-i', streamUrl,
        '-acodec', 'libmp3lame',
        '-ab', '128k',
        '-ar', '44100',
        '-ac', '2',
        '-f', 'mp3',
        '-fflags', '+nobuffer',
        '-flags', 'low_delay',
        '-strict', 'experimental',
        'pipe:1'
    ], {
        stdio: ['pipe', 'pipe', 'pipe']
    });

    // 记录活动流
    activeStreams.set(stationId, ffmpeg);

    // 将FFmpeg输出传输到响应
    ffmpeg.stdout.pipe(res);

    // 错误处理
    ffmpeg.stderr.on('data', (data) => {
        // FFmpeg的日志输出（可选：取消注释以调试）
        // console.log(`FFmpeg: ${data}`);
    });

    ffmpeg.on('error', (err) => {
        console.error(`FFmpeg错误: ${err.message}`);
        activeStreams.delete(stationId);
    });

    ffmpeg.on('close', (code) => {
        console.log(`🔇 ${station.name} 流已关闭 (code: ${code})`);
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
