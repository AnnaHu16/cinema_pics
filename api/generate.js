// api/generate.js
export default async function handler(req, res) {
    const TMDB_KEY = process.env.TMDB_API_KEY;
    const OR_KEY = process.env.OPENROUTER_API_KEY;

    try {
        // --- 1. 获取近10年电影 (保持之前的逻辑) ---
        const today = new Date().toISOString().split('T')[0]; 
        const tenYearsAgo = "2016-01-01";
        const page = Math.floor(Math.random() * 8) + 1; 

        const tmdbRes = await fetch(
            `https://api.themoviedb.org/3/discover/movie?sort_by=popularity.desc&page=${page}&language=zh-CN&primary_release_date.gte=${tenYearsAgo}&primary_release_date.lte=${today}`, 
            { headers: { Authorization: `Bearer ${TMDB_KEY}` } }
        );
        const tmdbData = await tmdbRes.json();
        const movie = tmdbData.results[Math.floor(Math.random() * tmdbData.results.length)];

        // --- 2. 获取 AI 台词 ---
        const aiRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${OR_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                "model": "google/gemini-2.0-flash-001", 
                "messages": [{ "role": "user", "content": `针对电影《${movie.title}》，给出一句经典台词。格式JSON：{"zh":"内容","en":"Content"}` }]
            })
        });
        const aiData = await aiRes.json();
        const quote = JSON.parse(aiData.choices[0].message.content.trim().replace(/```json|```/g, ''));

        // --- 3. 核心创新：下载图片并将其转为 Base64 数据 ---
        // 避开 w1280 高清原图，使用 w780 适中尺寸，兼顾清晰度和数据量
        const imageUrl = `https://image.tmdb.org/t/p/w780${movie.backdrop_path}`;
        const imageRes = await fetch(imageUrl);
        const imageBuffer = await imageRes.arrayBuffer();
        
        // 将二进制图片数据转为前端可用的 Base64 字符串
        const imageBase64 = `data:image/jpeg;base64,${Buffer.from(imageBuffer).toString('base64')}`;

        // --- 4. 返回完整数据 ---
        res.status(200).json({
            title: movie.title,
            year: movie.release_date ? movie.release_date.split('-')[0] : "未知",
            image: imageBase64, // 这里返回的是图片数据，而不是链接
            quote: quote
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "电影感生成失败" });
    }
}
