export default async function handler(req, res) {
    const TMDB_KEY = process.env.TMDB_API_KEY;
    const OR_KEY = process.env.OPENROUTER_API_KEY;
    const timestamp = req.query.t || Date.now(); // 接收前端时间戳

    try {
        // 增加随机页数和随机起始位置
        const page = Math.floor(Math.random() * 30) + 1;
        const movieIndex = Math.floor(Math.random() * 20);

        const tmdbRes = await fetch(
            `https://api.themoviedb.org/3/discover/movie?sort_by=popularity.desc&page=${page}&language=zh-CN&primary_release_date.gte=2000-01-01`,
            { headers: { Authorization: `Bearer ${TMDB_KEY}` } }
        );
        const tmdbData = await tmdbRes.json();
        const movie = tmdbData.results[movieIndex] || tmdbData.results[0];

        // 在 Prompt 中加入随机因子，强迫 AI 刷新
        const aiRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${OR_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                "model": "google/gemini-2.0-flash-001",
                "messages": [{ 
                    "role": "user", 
                    "content": `电影：《${movie.title}》。随机种子：${timestamp}。
                    任务：给出该电影中一句确实存在的、最具灵魂的台词。
                    要求：如果是外语片请提供英文原话+中文翻译；如果是华语片请提供中文原话+贴切的英文翻译。
                    格式：只返回JSON:{"zh":"内容","en":"Content"}` 
                }]
            })
        });

        const aiData = await aiRes.json();
        const content = aiData.choices[0].message.content.trim().replace(/```json|```/g, '');
        const quote = JSON.parse(content);

        const imageUrl = `https://image.tmdb.org/t/p/w780${movie.backdrop_path}`;
        const imageRes = await fetch(imageUrl);
        const imageBuffer = await imageRes.arrayBuffer();
        const imageBase64 = `data:image/jpeg;base64,${Buffer.from(imageBuffer).toString('base64')}`;

        res.status(200).json({
            title: movie.title,
            year: movie.release_date ? movie.release_date.split('-')[0] : "",
            image: imageBase64,
            quote: quote
        });

    } catch (error) {
        res.status(500).json({ error: "API limit or connection error" });
    }
}
