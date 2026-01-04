/**
 * 生成欧卡2自定义电台配置文件 (live_streams.sii)
 * 
 * 配置文件位置：
 * Windows: %USERPROFILE%\Documents\Euro Truck Simulator 2\live_streams.sii
 * 或游戏安装目录下的 def\live_streams.sii
 */
const fs = require('fs');
const path = require('path');

// 本地服务器端口
const SERVER_PORT = 3000;
const SERVER_HOST = '127.0.0.1';

/**
 * 将中文电台名称转换为拼音/英文（简化版）
 * 欧卡2电台名称只支持ASCII字符
 */
function toEnglishName(chineseName) {
    // 常见电台名称映射
    const nameMap = {
        '中国之声': 'China Voice',
        '经济之声': 'Economy Voice',
        '音乐之声': 'Music Voice',
        '都市之声': 'City Voice',
        '中华之声': 'Zhonghua Voice',
        '神州之声': 'Shenzhou Voice',
        '华夏之声': 'Huaxia Voice',
        '香港之声': 'Hong Kong Voice',
        '民族之声': 'Minzu Voice',
        '文艺之声': 'Arts Voice',
        '老年之声': 'Seniors Voice',
        '娱乐广播': 'Entertainment Radio',
        '高速广播': 'Highway Radio',
        '交通广播': 'Traffic Radio',
        '新闻广播': 'News Radio',
        '音乐广播': 'Music Radio',
        '经济广播': 'Economy Radio',
        '生活广播': 'Life Radio',
        '文艺广播': 'Arts Radio',
        '旅游广播': 'Travel Radio',
        '农村广播': 'Rural Radio',
        '体育广播': 'Sports Radio',
        '私家车广播': 'Car Radio',
        '故事广播': 'Story Radio',
    };

    // 尝试匹配已知名称
    for (const [cn, en] of Object.entries(nameMap)) {
        if (chineseName.includes(cn)) {
            // 提取省份/城市前缀
            const prefix = chineseName.replace(cn, '').trim();
            if (prefix) {
                return `${prefix} ${en}`.replace(/广播电台|电台|人民广播/g, '').trim();
            }
            return en;
        }
    }

    // 如果没有匹配，尝试基本清理
    return chineseName
        .replace(/广播电台|电台|人民广播|频率|频道/g, '')
        .replace(/[^\w\s\u4e00-\u9fa5]/g, '')
        .trim() || 'Radio CN';
}

/**
 * 获取电台流派
 */
function getGenre(station) {
    const name = station.name.toLowerCase();
    if (name.includes('新闻') || name.includes('之声')) return 'news';
    if (name.includes('音乐') || name.includes('music')) return 'music';
    if (name.includes('交通') || name.includes('高速')) return 'traffic';
    if (name.includes('经济') || name.includes('财经')) return 'economy';
    if (name.includes('文艺') || name.includes('故事')) return 'culture';
    if (name.includes('体育')) return 'sports';
    if (name.includes('娱乐') || name.includes('都市')) return 'entertainment';
    return 'general';
}

/**
 * 生成 live_streams.sii 文件
 */
function generateSiiFile() {
    const stationsPath = path.join(__dirname, 'stations.json');

    if (!fs.existsSync(stationsPath)) {
        console.error('❌ 错误: 未找到 stations.json');
        console.log('   请先运行 npm run crawl 爬取电台数据');
        process.exit(1);
    }

    const stations = JSON.parse(fs.readFileSync(stationsPath, 'utf-8'));

    console.log('====================================');
    console.log('  欧卡2电台配置文件生成器');
    console.log('====================================\n');

    // 生成SII文件内容
    let siiContent = `SiiNunit
{
# 欧卡2中国电台配置文件
# 由 ets2-radio-cn 工具自动生成
# 生成时间: ${new Date().toISOString()}
#
# 使用说明:
# 1. 确保本地转发服务器正在运行 (npm start)
# 2. 将此文件复制到:
#    %USERPROFILE%\\Documents\\Euro Truck Simulator 2\\live_streams.sii
# 3. 重启游戏即可在电台列表中看到中国电台

live_stream_def : .live_streams {
 stream_data: ${stations.length}
`;

    // 添加每个电台
    stations.forEach((station, index) => {
        const streamUrl = `http://${SERVER_HOST}:${SERVER_PORT}/stream/${station.id}`;
        const name = toEnglishName(station.name);
        const genre = getGenre(station);

        // SII格式的流数据
        // 格式: stream_data[index]: "URL|Name|Genre|Language|Bitrate|Favorite"
        siiContent += ` stream_data[${index}]: "${streamUrl}|${name}|${genre}|CN|128|0"\n`;
    });

    siiContent += `}
}
`;

    // 保存文件
    const outputPath = path.join(__dirname, 'live_streams.sii');
    fs.writeFileSync(outputPath, siiContent, 'utf-8');

    console.log(`✅ 配置文件已生成: ${outputPath}`);
    console.log(`📻 包含 ${stations.length} 个电台\n`);

    // 生成安装说明
    const readmePath = path.join(__dirname, 'INSTALL.md');
    const readme = `# 欧卡2中国电台 - 安装说明

## 📁 文件说明

- \`live_streams.sii\` - 欧卡2电台配置文件
- \`stations.json\` - 电台数据（JSON格式）

## 🚀 安装步骤

### 1. 安装FFmpeg

本工具需要FFmpeg来转换音频流。请下载并安装：

**Windows:**
1. 访问 https://ffmpeg.org/download.html
2. 下载 Windows 版本
3. 解压到 \`C:\\ffmpeg\`
4. 将 \`C:\\ffmpeg\\bin\` 添加到系统 PATH 环境变量

验证安装：
\`\`\`bash
ffmpeg -version
\`\`\`

### 2. 启动本地转发服务器

\`\`\`bash
cd ${__dirname.replace(/\\/g, '/')}
npm start
\`\`\`

服务器将在 http://127.0.0.1:${SERVER_PORT} 上运行。

### 3. 安装电台配置文件

将 \`live_streams.sii\` 复制到以下位置：

\`\`\`
${process.env.USERPROFILE}\\Documents\\Euro Truck Simulator 2\\live_streams.sii
\`\`\`

### 4. 重启游戏

重启欧卡2，在电台菜单中即可看到中国电台！

## ⚠️ 注意事项

1. **每次游戏前需要先启动转发服务器**
2. 服务器运行时会占用一定的CPU和网络带宽
3. 如果电台无法播放，检查FFmpeg是否正确安装
4. 流地址可能会过期，重新运行 \`npm run crawl\` 更新

## 📻 电台列表

共 ${stations.length} 个电台，包括：

${[...new Set(stations.map(s => s.province))].sort((a, b) => {
        if (a === '央广') return -1;
        if (b === '央广') return 1;
        return a.localeCompare(b, 'zh-CN');
    }).map(p => `- ${p}: ${stations.filter(s => s.province === p).length} 个`).join('\n')}

---
生成时间: ${new Date().toLocaleString('zh-CN')}
`;

    fs.writeFileSync(readmePath, readme, 'utf-8');
    console.log(`📖 安装说明已生成: ${readmePath}`);

    // 显示安装路径
    const ets2DocPath = path.join(process.env.USERPROFILE || '', 'Documents', 'Euro Truck Simulator 2');
    console.log(`\n📂 请将 live_streams.sii 复制到:`);
    console.log(`   ${ets2DocPath}\\live_streams.sii`);

    console.log('\n====================================');
    console.log('  生成完成！');
    console.log('====================================\n');
}

// 运行生成器
generateSiiFile();
