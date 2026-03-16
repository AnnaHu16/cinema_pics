export default async function handler(req, res) {
    const TMDB_KEY = process.env.TMDB_API_KEY;
    const OR_KEY = process.env.OPENROUTER_API_KEY;

    const fallbackQuote = { zh: "生活就像一盒巧克力，你永远不知道下一块是什么味道。", en: "Life is like a box of chocolates. You never know what you're gonna get." };

    try {
        // 1. 扩大随机范围：从前 20 页热门电影中随机挑选
        const page = Math.floor(Math.random() * 20) + 1;
        const movieIndex = Math.floor(Math.random() * 20);
        const today = new Date().toISOString().split('T')[0];
        const tenYearsAgo = "2010-01-01"; // 稍微扩大年份范围

        const tmdbRes = await fetch(
            `https://api.themoviedb.org/3/discover/movie?sort_by=popularity.desc&page=${page}&language=zh-CN&primary_release_date.gte=${tenYearsAgo}&primary_release_date.lte=${today}`,
            { headers: { Authorization: `Bearer ${TMDB_KEY}` } }
        );
        const tmdbData = await tmdbRes.json();
        const movie = tmdbData.results[movieIndex] || tmdbData.results[0];

        // 2. 注入随机噪声 (Nonce) 强迫 AI 刷新输出
        const nonce = Math.random().toString(36).substring(7);

        const aiRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${OR_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                "model": "google/gemini-2.0-flash-001",
                "messages": [{ 
                    "role": "user", 
                    "content": `电影：《${movie.title}》 (${movie.release_date})。
                    指令：请提供该电影的一句真实、经典的台词。
                    注意：不要给和之前重复的台词。随机参考号：${nonce}。
                    格式：只需输出JSON：{"zh":"中文","en":"English"}` 
                }]
            })
        });

        let quote = fallbackQuote;
        if (aiRes.ok) {
            const aiData = await aiRes.json();
            const content = aiData.choices[0].message.content.trim().replace(/```json|```/g, '');
            try {
                const parsedQuote = JSON.parse(content);
                if (parsedQuote.zh && parsedQuote.en) quote = parsedQuote;
            } catch (e) { console.error("Parse Error"); }
        }

        const safeMovie = {
            title: movie.title || "未知电影",
            year: (movie.release_date && movie.release_date.split('-')[0]) || "",
            backdrop_path: movie.backdrop_path
        };

        const imageUrl = `https://image.tmdb.org/t/p/w780${safeMovie.backdrop_path}`;
        const imageRes = await fetch(imageUrl);
        const imageBuffer = await imageRes.arrayBuffer();
        const imageBase64 = `data:image/jpeg;base64,${Buffer.from(imageBuffer).toString('base64')}`;

        res.status(200).json({
            title: safeMovie.title,
            year: safeMovie.year,
            image: imageBase64,
            quote: quote
        });

    } catch (error) {
        res.status(200).json({ title: "Error", year: "", image: "", quote: fallbackQuote });
    }
}
