// api/generate.js
import puppeteer from 'puppeteer-core';
import chromium from 'chrome-aws-lambda';

export default async function handler(req, res) {
    const TMDB_KEY = process.env.TMDB_API_KEY;
    const OR_KEY = process.env.OPENROUTER_API_KEY;

    // 获取前端传来的比例参数，默认为3:4
    const ratioParam = req.query.ratio || '34';

    try {
        // --- 1. 获取剧照和AI台词 (逻辑保持之前的精简版) ---
        const today = new Date().toISOString().split('T')[0]; 
        const tenYearsAgo = "2016-01-01";
        const page = Math.floor(Math.random() * 6) + 1; 

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
                "messages": [{ 
                    "role": "user", 
                    "content": `你是一个忧郁且文艺的电影评论家。请给出电影《${movie.title}》中一句最经典、充满emo感或文艺哲理的台词。JSON格式：{"zh": "中文台词", "en": "英文台词"}。必须严格遵守该格式。` 
                }]
            })
        });
        const aiData = await aiRes.json();
        const quote = JSON.parse(aiData.choices[0].message.content.trim().replace(/```json|```/g, ''));

        const movieYear = movie.release_date ? movie.release_date.split('-')[0] : "未知";
        const movieMeta = `— ${movie.title} (${movieYear})`;

        // 将图片转为 Base64 以方便后端 Puppeteer 渲染
        const imageUrl = `https://image.tmdb.org/t/p/w780${movie.backdrop_path}`;
        const imageRes = await fetch(imageUrl);
        const imageBuffer = await imageRes.arrayBuffer();
        const imageBase64 = `data:image/jpeg;base64,${Buffer.from(imageBuffer).toString('base64')}`;


        // --- 2. 核心创新：后端 Puppeteer 渲染拍立得图片 ---
        
        // 根据比例参数定义画布尺寸
        let canvasW, canvasH;
        if (ratioParam === '169') { canvasW = 600; canvasH = 680; } // 16:9 宽屏拍立得
        else if (ratioParam === '11') { canvasW = 600; canvasH = 600; } // 1:1 方形拍立得
        else { canvasW = 600; canvasH = 800; } // 默认 3:4 纵向拍立得

        // 启动 Puppeteer (在Vercel的无服务器环境运行)
        const browser = await puppeteer.launch({
            args: chromium.args,
            defaultViewport: { width: canvasW, height: canvasH, deviceScaleFactor: 2 }, // 2倍高清晰度
            executablePath: await chromium.executablePath,
            headless: chromium.headless,
            ignoreHTTPSErrors: true,
        });

        const pageHtml = browser.newPage();
        
        // 在 Puppeteer 内部页面上构造拍立得的 HTML 和 CSS (高级排版)
        const htmlContent = `
            <!DOCTYPE html>
            <html lang="zh-CN">
            <head>
                <meta charset="UTF-8">
                <style>
                    body { 
                        margin: 0; padding: 0; background: transparent; 
                        width: ${canvasW}px; height: ${canvasH}px;
                        display: flex; flex-direction: column; align-items: center; justify-content: flex-start;
                        font-family: 'SF Pro Display', -apple-system, sans-serif;
                    }
                    /* 拍立得容器：设置高级Emo灰色 */
                    #card {
                        background: #fdfdfd; padding: 20px 20px 60px 20px;
                        border-radius: 2px;
                        width: 100%; height: 100%;
                        display: flex; flex-direction: column; align-items: center;
                    }
                    /* 剧照框架：根据比例自动变形 */
                    #frame {
                        width: 100%; background: #000; overflow: hidden;
                        display: flex; align-items: center; justify-content: center;
                        border-radius: 2px;
                        ${ratioParam === '169' ? 'aspect-ratio: 16 / 9;' : ratioParam === '11' ? 'aspect-ratio: 1 / 1;' : 'aspect-ratio: 3 / 4;'}
                    }
                    #movie-img { max-width: 100%; max-height: 100%; object-fit: contain; }

                    /* 台词区域：拍立得留白感 */
                    #quote-area { margin-top: 35px; text-align: center; color: #1a1a1a; width: 100%; }

                    /* 中文台词：亮黄色字幕 */
                    #quote-zh { 
                        font-family: 'PingFang SC', serif; 
                        font-size: 26px; font-weight: 900; line-height: 1.5; margin: 0 0 10px 0;
                        color: #f1c40f; 
                        text-shadow: 2px 2px 3px rgba(0,0,0,0.9), -1px -1px 3px rgba(0,0,0,0.9);
                    }
                    /* 英文台词：灰色小字居中 */
                    #quote-en { 
                        font-family: 'Georgia', serif; font-size: 14px; text-transform: uppercase; 
                        letter-spacing: 0.1em; color: #888; line-height: 1.4; margin: 0;
                    }
                    #movie-meta { font-size: 11px; color: #aaa; font-style: italic; margin-top: 30px; text-align: right; width: 100%; padding-right: 15px; }
                </style>
            </head>
            <body>
                <div id="card">
                    <div id="frame"><img id="movie-img" src="${imageBase64}"></div>
                    <div id="quote-area">
                        <p id="quote-zh">${quote.zh}</p>
                        <p id="quote-en">${quote.en}</p>
                        <p id="movie-meta">${movieMeta}</p>
                    </div>
                </div>
            </body>
            </html>
        `;

        await (await pageHtml).setContent(htmlContent);
        
        // 关键动作：截取一张高清PNG图片
        const screenshotBuffer = await (await pageHtml).screenshot({ type: 'png', fullPage: true });
        
        await browser.close();

        // 将合成好的图片Buffer转为 Base64 字符串返回给前端
        const finalBase64 = `data:image/png;base64,${screenshotBuffer.toString('base64')}`;

        res.status(200).json({
            image: finalBase64, // 这里返回的是已经在后端完美合成、排版好的完整PNG图片数据
            title: movie.title // 仅供参考
        });

    } catch (error) {
        console.error("ServerError:", error);
        res.status(500).json({ error: "电影感生成失败" });
    }
}
