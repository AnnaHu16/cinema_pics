// api/generate.js
// 引入轻量级图片处理库 (纯JS，无需编译)
import Jimp from 'jimp';

export default async function handler(req, res) {
    const TMDB_KEY = process.env.TMDB_API_KEY;
    const OR_KEY = process.env.OPENROUTER_API_KEY;

    try {
        // --- 1. 获取电影剧照和 AI 台词 (保持之前的逻辑) ---
        const today = new Date().toISOString().split('T')[0]; 
        const tenYearsAgo = "2016-01-01";
        const page = Math.floor(Math.random() * 8) + 1; // 缩小页码范围确保质量

        const tmdbRes = await fetch(
            `https://api.themoviedb.org/3/discover/movie?sort_by=popularity.desc&page=${page}&language=zh-CN&primary_release_date.gte=${tenYearsAgo}&primary_release_date.lte=${today}`, 
            { headers: { Authorization: `Bearer ${TMDB_KEY}` } }
        );
        const tmdbData = await tmdbRes.json();
        const movie = tmdbData.results[Math.floor(Math.random() * tmdbData.results.length)];

        const aiRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${OR_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                "model": "google/gemini-2.0-flash-001", 
                "messages": [{ "role": "user", "content": `你是一个文艺电影评论家。请给出电影《${movie.title}》中一句最经典、充满emo感或文艺哲理的台词。只要输出JSON格式：{"zh": "中文台词", "en": "英文台词"}，不要有任何多余文字。` }]
            })
        });
        const aiData = await aiRes.json();
        const quote = JSON.parse(aiData.choices[0].message.content.trim().replace(/```json|```/g, ''));

        const movieYear = movie.release_date ? movie.release_date.split('-')[0] : "";
        const movieMeta = `— ${movie.title} (${movieYear})`;

        // --- 2. 核心创新：在后端合成拍立得图片 ---

        // 定义拍立得画布尺寸 (基于 3:4 比例，设置一个高清尺寸)
        const CANVAS_W = 600;
        const CANVAS_H = 800;
        const PADDING = 25; // 相纸边距

        // 创建空白的白色相纸画布
        const canvas = new Jimp(CANVAS_W, CANVAS_H, 0xfdfdfdff); 

        // 下载电影剧照
        const imageUrl = `https://image.tmdb.org/t/p/w1280${movie.backdrop_path}`;
        const movieImg = await Jimp.read(imageUrl);

        // 处理剧照：自动缩放并水平居中，贴着上边距
        const photoW = CANVAS_W - (PADDING * 2);
        const photoH = Math.round(photoW * (9 / 16)); // 剧照保持 16:9
        movieImg.resize(photoW, photoH);
        
        // 将剧照放到相纸上 (Padding, Padding)
        canvas.composite(movieImg, PADDING, PADDING);

        // 绘制照片黑框 (美观)
        const borderOpts = { x: PADDING, y: PADDING, w: photoW, h: photoH };
        // Jimp 绘制矩形需要一些 hack，这里简化，只做一个全黑底
        // const blackFrame = new Jimp(photoW, photoH, 0x000000ff);
        // canvas.composite(blackFrame, PADDING, PADDING);
        // canvas.composite(movieImg, PADDING, PADDING);

        // --- 3. 绘制文字 (Jimp 使用预设字体) ---
        // 加载 Jimp 自带的宋体/衬线字体
        const fontZh = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK); // 中文台词
        const fontEn = await Jimp.loadFont(Jimp.FONT_SANS_14_BLACK); // 英文台词
        const fontMeta = await Jimp.loadFont(Jimp.FONT_SANS_12_BLACK); // 电影信息

        const textYStart = PADDING + photoH + 35; // 文字起始 Y 坐标

        //JimP 文字不支持直接画中文，这是一个巨大的技术坑。
        //为了完美实现，我们必须放弃 Jimp，转而使用更强大的通用后端 Canvas 库。
        //但这通常需要 Vercel 服务端编译环境，非常复杂。

        //为了给你最快、最稳的方案，我将代码切回前端合成，但采用全新的“双 Base64”防微信屏蔽技术。
        //这能解决展示和长按保存问题。

        //请将此 api/generate.js 的全部内容替换为下面的精简版，只负责返回数据。
        //真正的合成逻辑在新的 index.html 里通过前端 Canvas 完成，但避开了图片域名加载。

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed" });
    }
}
