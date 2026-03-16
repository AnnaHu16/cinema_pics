export default async function handler(req, res) {
    const TMDB_KEY = process.env.TMDB_API_KEY;
    const OR_KEY = process.env.OPENROUTER_API_KEY;

    try {
        // 1. 获取近10年随机热门电影
        const today = "2026-12-31"; 
        const tenYearsAgo = "2016-01-01";
        const page = Math.floor(Math.random() * 15) + 1; 

        const tmdbRes = await fetch(
            `https://api.themoviedb.org/3/discover/movie?sort_by=popularity.desc&page=${page}&language=zh-CN&primary_release_date.gte=${tenYearsAgo}&primary_release_date.lte=${today}`, 
            { headers: { Authorization: `Bearer ${TMDB_KEY}` } }
        );
        const tmdbData = await tmdbRes.json();
        const movie = tmdbData.results[Math.floor(Math.random() * tmdbData.results.length)];

        // 2. 获取 AI 双语台词
        const aiRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${OR_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                "model": "google/gemini-2.0-flash-001", 
                "messages": [{ 
                    "role": "user", 
                    "content": `你是一个电影评论家。请给出电影《${movie.title}》中一句最经典的文艺台词。必须包含中文和英文翻译。JSON格式：{"zh":"内容","en":"Content"}` 
                }]
            })
        });
        const aiData = await aiRes.json();
        const quote = JSON.parse(aiData.choices[0].message.content.trim().replace(/```json|```/g, ''));

        // 3. 将图片转为 Base64 以支持微信长按保存
        const imageUrl = `https://image.tmdb.org/t/p/w780${movie.backdrop_path}`;
        const imageRes = await fetch(imageUrl);
        const imageBuffer = await imageRes.arrayBuffer();
        const imageBase64 = `data:image/jpeg;base64,${Buffer.from(imageBuffer).toString('base64')}`;

        // 4. 返回完整数据
        res.status(200).json({
            title: movie.title,
            year: movie.release_date ? movie.release_date.split('-')[0] : "Unknown",
            image: imageBase64,
            quote: quote
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch cinematic data" });
    }
}
