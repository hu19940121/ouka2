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
 * 渲染HTML模板
 * @param {string} template 模板内容
 * @param {object} data 替换数据
 */
function renderTemplate(template, data) {
    let result = template;
    for (const [key, value] of Object.entries(data)) {
        result = result.replace(new RegExp(`{{${key}}}`, 'g'), value);
    }
    return result;
}

/**
 * 生成电台HTML列表
 */
function generateStationListHtml(stationsData) {
    return stationsData.map(s => {
        const escapedName = s.name.replace(/'/g, "\\'").replace(/"/g, '&quot;');
        return `
            <div class="station" data-name="${s.name}" data-province="${s.province}" data-url="${s.url}">
                <img src="${s.image || 'https://via.placeholder.com/55/1a1a2e/666?text=📻'}" alt="${s.name}" onerror="this.src='https://via.placeholder.com/55/1a1a2e/666?text=📻'">
                <div class="station-info">
                    <div class="station-name">${s.name}</div>
                    <div class="station-province">${s.province}</div>
                    <div class="station-url">${s.url}</div>
                </div>
                <div class="station-actions">
                    <button class="btn btn-play" onclick="playStation('${s.url}', '${escapedName}', '${s.province}')">▶</button>
                    <button class="btn btn-copy" onclick="copyUrl(this, '${s.url}')">复制</button>
                </div>
            </div>`;
    }).join('');
}

/**
 * 生成省份选项HTML
 */
function generateProvinceOptions(provinces, stationsList) {
    return provinces.map(p => {
        const count = stationsList.filter(s => (s.province || '其他') === p).length;
        return `<option value="${p}">${p} (${count})</option>`;
    }).join('');
}

// 静态文件服务
app.use('/css', express.static(path.join(__dirname, 'public/css')));
app.use('/js', express.static(path.join(__dirname, 'public/js')));
app.use('/public', express.static(path.join(__dirname, 'public')));

/**
 * 首页 - 显示所有可用电台
 */
app.get('/', (req, res) => {
    // 读取模板文件
    const templatePath = path.join(__dirname, 'views', 'index.html');

    if (!fs.existsSync(templatePath)) {
        return res.status(500).send('模板文件不存在');
    }

    const template = fs.readFileSync(templatePath, 'utf-8');

    // 获取所有省份列表
    const provinces = [...new Set(stations.map(s => s.province || '其他'))].sort((a, b) => {
        if (a === '央广') return -1;
        if (b === '央广') return 1;
        return a.localeCompare(b, 'zh-CN');
    });

    // 生成电台数据
    const stationsData = stations.map(s => ({
        id: s.id,
        name: s.name,
        province: s.province || '其他',
        image: s.image || '',
        url: `http://127.0.0.1:${PORT}/stream/${s.id}`
    }));

    // 渲染模板
    const html = renderTemplate(template, {
        TOTAL_STATIONS: stations.length.toString(),
        PORT: PORT.toString(),
        PROVINCE_OPTIONS: generateProvinceOptions(provinces, stations),
        STATION_LIST: generateStationListHtml(stationsData)
    });

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
