# 🚛 欧卡2中国电台工具

将云听（radio.cn）的中国电台转换为欧卡2（Euro Truck Simulator 2）可用的自定义电台格式。

## ✨ 功能特点

- 🕷️ **自动爬取** - 从云听网站爬取全国电台数据
- 🔄 **流格式转换** - 将 m3u8 流实时转换为 MP3 格式
- 📻 **本地服务器** - 提供本地HTTP端点供欧卡2访问
- ⚙️ **配置生成** - 自动生成欧卡2电台配置文件

## 📦 安装

### 前置要求

1. **Node.js** (v18+) - https://nodejs.org/
2. **FFmpeg** - https://ffmpeg.org/download.html

### 安装FFmpeg (Windows)

```powershell
# 使用 winget 安装（推荐）
winget install FFmpeg

# 或使用 Chocolatey
choco install ffmpeg

# 或手动下载安装后添加到 PATH
```

### 安装项目依赖

```bash
cd e:\code\ouka2
npm install
```

## 🚀 使用方法

### 步骤1: 爬取电台数据

```bash
npm run crawl
```

这将从云听网站爬取所有中国电台，保存到 `stations.json`。

### 步骤2: 生成欧卡2配置文件

```bash
npm run generate
```

这将生成 `live_streams.sii` 配置文件。

### 步骤3: 启动本地转发服务器

```bash
npm start
```

服务器将在 `http://127.0.0.1:3000` 上运行。

### 步骤4: 安装到欧卡2

1. 将 `live_streams.sii` 复制到欧卡2文档目录：
   ```
   %USERPROFILE%\Documents\Euro Truck Simulator 2\live_streams.sii
   ```

2. 重启欧卡2游戏

3. 在游戏中的电台菜单中选择中国电台！

## 📁 文件结构

```
ouka2/
├── package.json      # 项目配置
├── crawler.js        # 电台爬虫
├── server.js         # 本地转发服务器
├── generate-sii.js   # 配置文件生成器
├── stations.json     # 爬取的电台数据
├── live_streams.sii  # 欧卡2配置文件
└── README.md         # 本文件
```

## ⚠️ 注意事项

1. **每次游戏前需要先启动转发服务器** (`npm start`)
2. 电台流地址可能会过期，定期重新运行 `npm run crawl` 更新
3. 服务器需要稳定的网络连接
4. FFmpeg会占用一定的CPU资源进行音频转码

## 🔧 配置选项

### 修改服务器端口

编辑 `server.js`，修改 `PORT` 变量：

```javascript
const PORT = process.env.PORT || 3000;
```

### 修改音频质量

编辑 `server.js` 中的FFmpeg参数：

```javascript
'-ab', '128k',   // 比特率（可选：96k, 128k, 192k, 320k）
'-ar', '44100',  // 采样率
```

## 📺 Web界面

启动服务器后，访问 http://127.0.0.1:3000 可以：

- 查看所有可用电台
- 复制电台流地址
- 测试电台是否正常工作

## 🐛 常见问题

### Q: 电台无法播放？

1. 确保本地服务器正在运行
2. 检查FFmpeg是否正确安装：`ffmpeg -version`
3. 检查网络连接是否正常

### Q: 流地址过期？

重新运行爬虫更新数据：
```bash
npm run crawl
npm run generate
```

### Q: 游戏中看不到电台？

1. 确保 `live_streams.sii` 放在正确位置
2. 确保游戏完全重启
3. 检查配置文件格式是否正确

## 📄 许可证

MIT License

---

Made with ❤️ for Euro Truck Simulator 2 players in China
