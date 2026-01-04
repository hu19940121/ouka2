/**
 * 云听电台爬虫
 * 爬取 radio.cn 的所有电台频道数据
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// API密钥（从网站前端JS中提取）
const API_KEY = 'f0fc4c668392f9f9a447e48584c214ee';
const BASE_URL = 'https://ytmsout.radio.cn';

/**
 * 生成API签名
 * @param {Object} params 请求参数
 * @param {number} timestamp 时间戳
 * @returns {string} MD5签名（大写）
 */
function generateSign(params, timestamp) {
    // 按键排序并拼接参数
    const sortedKeys = Object.keys(params).sort();
    const paramStr = sortedKeys.map(key => `${key}=${params[key]}`).join('&');

    // 拼接完整签名字符串
    let signText = paramStr ?
        `${paramStr}&timestamp=${timestamp}&key=${API_KEY}` :
        `timestamp=${timestamp}&key=${API_KEY}`;

    // MD5加密并转大写
    return crypto.createHash('md5').update(signText).digest('hex').toUpperCase();
}

/**
 * 发起API请求
 * @param {string} endpoint API端点
 * @param {Object} params 请求参数
 * @returns {Promise<Object>} 响应数据
 */
async function apiRequest(endpoint, params = {}) {
    const timestamp = Date.now();
    const sign = generateSign(params, timestamp);

    // 构建查询字符串
    const queryStr = Object.keys(params).length > 0 ?
        '?' + Object.entries(params).map(([k, v]) => `${k}=${v}`).join('&') : '';

    const url = `${BASE_URL}${endpoint}${queryStr}`;

    console.log(`请求: ${url}`);

    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'equipmentId': '0000',
            'platformCode': 'WEB',
            'Content-Type': 'application/json',
            'timestamp': timestamp.toString(),
            'sign': sign
        }
    });

    const data = await response.json();

    if (data.code !== 0) {
        throw new Error(`API错误: ${data.code} - ${data.message}`);
    }

    return data;
}

/**
 * 获取所有省份列表
 */
async function getProvinces() {
    const data = await apiRequest('/web/appProvince/list/all');
    return data.data || [];
}

/**
 * 获取电台分类列表
 */
async function getCategories() {
    const data = await apiRequest('/web/appCategory/list/all');
    return data.data || [];
}

/**
 * 获取电台列表
 * @param {string} provinceCode 省份代码（0表示全国/央广）
 * @param {string} categoryId 分类ID（0表示全部）
 */
async function getRadioStations(provinceCode = '0', categoryId = '0') {
    const data = await apiRequest('/web/appBroadcast/list', {
        categoryId,
        provinceCode
    });
    return data.data || [];
}

/**
 * 主函数：爬取所有电台
 */
async function crawlAllStations() {
    console.log('====================================');
    console.log('  云听电台爬虫 - 欧卡2电台工具');
    console.log('====================================\n');

    const allStations = [];

    try {
        // 1. 先获取央广电台（provinceCode=0）
        console.log('📻 正在获取央广电台...');
        const centralStations = await getRadioStations('0', '0');
        console.log(`   找到 ${centralStations.length} 个央广电台\n`);

        for (const station of centralStations) {
            allStations.push({
                id: station.contentId,
                name: station.title,
                subtitle: station.subtitle || '',
                image: station.image,
                province: '央广',
                playUrlLow: station.playUrlLow,
                mp3PlayUrlLow: station.mp3PlayUrlLow,
                mp3PlayUrlHigh: station.mp3PlayUrlHigh
            });
        }

        // 2. 获取所有省份
        console.log('📍 正在获取省份列表...');
        const provinces = await getProvinces();
        console.log(`   找到 ${provinces.length} 个省份\n`);

        // 3. 遍历每个省份获取电台
        for (const province of provinces) {
            console.log(`📻 正在获取 ${province.provinceName} 电台...`);

            try {
                const stations = await getRadioStations(province.provinceCode, '0');
                console.log(`   找到 ${stations.length} 个电台`);

                for (const station of stations) {
                    // 检查是否已存在（去重）
                    if (!allStations.find(s => s.id === station.contentId)) {
                        allStations.push({
                            id: station.contentId,
                            name: station.title,
                            subtitle: station.subtitle || '',
                            image: station.image,
                            province: province.provinceName,
                            playUrlLow: station.playUrlLow,
                            mp3PlayUrlLow: station.mp3PlayUrlLow,
                            mp3PlayUrlHigh: station.mp3PlayUrlHigh
                        });
                    }
                }

                // 避免请求过快
                await new Promise(resolve => setTimeout(resolve, 200));

            } catch (err) {
                console.error(`   获取 ${province.provinceName} 电台失败: ${err.message}`);
            }
        }

        console.log('\n====================================');
        console.log(`✅ 爬取完成！共获取 ${allStations.length} 个电台`);
        console.log('====================================\n');

        // 保存到文件
        const outputPath = path.join(__dirname, 'stations.json');
        fs.writeFileSync(outputPath, JSON.stringify(allStations, null, 2), 'utf-8');
        console.log(`📁 数据已保存到: ${outputPath}`);

        // 按省份统计
        const provinceStats = {};
        for (const station of allStations) {
            provinceStats[station.province] = (provinceStats[station.province] || 0) + 1;
        }

        console.log('\n📊 各省份电台统计:');
        for (const [province, count] of Object.entries(provinceStats).sort((a, b) => b[1] - a[1])) {
            console.log(`   ${province}: ${count} 个`);
        }

        return allStations;

    } catch (error) {
        console.error('爬取失败:', error.message);
        throw error;
    }
}

// 运行爬虫
crawlAllStations().catch(console.error);

module.exports = { crawlAllStations, getRadioStations, generateSign };
