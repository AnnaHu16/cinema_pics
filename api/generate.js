export default async function handler(req, res) {
    const TMDB_KEY = process.env.TMDB_API_KEY; // 在Vercel后台设置
    const OR_KEY = process.env.OPENROUTER_API_KEY; // 在Vercel后台设置

    try {
        // 1. 获取随机电影
        const page = Math.floor(Math.random() * 20) + 1;
        const tmdbRes = await fetch(`https://api.themoviedb.org/3/discover/movie?sort_by=popularity.desc&page=${page}&language=zh-CN`, {
            headers: { Authorization: `Bearer ${TMDB_KEY}` }
        });
        const tmdbData = await tmdbRes.json();
        const movie = tmdbData.results[Math.floor(Math.random() * tmdbData.results.length)];

        // 2. 获取 AI 台词
        const aiRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${OR_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                "model": "google/gemini-2.0-flash-001",
                "messages": [{ "role": "user", "content": `针对电影《${movie.title}》，给出一句经典台词。格式JSON：{"zh":"内容","en":"Content"}` }]
            })
        });
        const aiData = await aiRes.json();
        const quote = JSON.parse(aiData.choices[0].message.content.replace(/```json|```/g, ''));

        // 3. 返回给前端
        res.status(200).json({
            title: movie.title,
            year: movie.release_date.split('-')[0],
            image: `https://image.tmdb.org/t/p/original${movie.backdrop_path}`,
            quote: quote
        });
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch data" });
    }
}
