export default async function handler(req, res) {
    const TMDB_KEY = process.env.TMDB_API_KEY;
    const OR_KEY = process.env.OPENROUTER_API_KEY;

    const fallbackQuote = { zh: "有些事，你现在不必问；有些人，你永远不必等。", en: "Some things you don't have to ask now; some people you never have to wait for." };

    try {
        const page = Math.floor(Math.random() * 10) + 1;
        const today = new Date().toISOString().split('T')[0];
        const tenYearsAgo = "2016-01-01";

        const tmdbRes = await fetch(
            `https://api.themoviedb.org/3/discover/movie?sort_by=popularity.desc&page=${page}&language=zh-CN&primary_release_date.gte=${tenYearsAgo}&primary_release_date.lte=${today}`,
            { headers: { Authorization: `Bearer ${TMDB_KEY}` } }
        );
        const tmdbData = await tmdbRes.json();
        const movie = tmdbData.results[Math.floor(Math.random() * tmdbData.results.length)];

        // --- 核心修改：强化原台词检索 Prompt ---
        const aiRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${OR_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                "model": "google/gemini-2.0-flash-001",
                "messages": [{ 
                    "role": "user", 
                    "content": `你是一个精通中外电影的专家。
                    请检索并给出电影《${movie.title}》 (${movie.release_date}) 中一句最真实、最具代表性的原台词。
                    要求：
                    1. 必须是该电影中确实出现的经典对白或内心独白。
                    2. 提供中文翻译和对应的英文原文（如果是华语片请自行贴切翻译成英文）。
                    3. 严格按此JSON格式输出，不要有任何其他解释文字：{"zh":"中文原台词","en":"English Quote"}` 
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
            } catch (e) { console.error("解析失败"); }
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
