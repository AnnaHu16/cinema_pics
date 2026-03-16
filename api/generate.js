export default async function handler(req, res) {
    const TMDB_KEY = process.env.TMDB_API_KEY;
    const OR_KEY = process.env.OPENROUTER_API_KEY;

    // 定义兜底数据，以防 API 失败
    const fallbackQuote = { zh: "电影，就是把生活中的枯燥部分切掉后的东西。", en: "Cinema is a is life with the dull parts cut out." };
    const fallbackMovie = { title: "未知电影", year: "" };

    try {
        const page = Math.floor(Math.random() * 15) + 1;
        const today = new Date().toISOString().split('T')[0];
        const tenYearsAgo = "2016-01-01";

        // 1. 获取 TMDB 电影
        const tmdbRes = await fetch(
            `https://api.themoviedb.org/3/discover/movie?sort_by=popularity.desc&page=${page}&language=zh-CN&primary_release_date.gte=${tenYearsAgo}&primary_release_date.lte=${today}`,
            { headers: { Authorization: `Bearer ${TMDB_KEY}` } }
        );
        
        if (!tmdbRes.ok) throw new Error("TMDB 访问失败");
        const tmdbData = await tmdbRes.json();
        
        if (!tmdbData.results || tmdbData.results.length === 0) throw new Error("未找到电影");
        const movie = tmdbData.results[Math.floor(Math.random() * tmdbData.results.length)];

        // 2. 获取 AI 双语台词
        const aiRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${OR_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                "model": "google/gemini-2.0-flash-001",
                "messages": [{ "role": "user", "content": `针对电影《${movie.title}》，给出其最经典、充满emo感或文艺哲理的台词。必须包含中文和英文翻译。严格遵守格式JSON：{"zh":"中文内容","en":"English Content"}` }]
            })
        });

        let quote = fallbackQuote;
        if (aiRes.ok) {
            const aiData = await aiRes.json();
            const content = aiData.choices[0].message.content.trim().replace(/```json|```/g, '');
            try {
                // 确保解析出来的 JSON 是合法的
                const parsedQuote = JSON.parse(content);
                // 确保中英文台词都不是空字符串
                if (parsedQuote.zh && parsedQuote.en) {
                    quote = parsedQuote;
                }
            } catch (e) {
                console.error("台词 JSON 解析失败:", content);
            }
        }

        // 3. 彻底防止 movie 信息和年份出现 undefined
        const safeMovie = {
            title: movie.title || fallbackMovie.title,
            year: (movie.release_date && movie.release_date.split('-')[0]) || fallbackMovie.year,
            backdrop_path: movie.backdrop_path
        };

        // 4. 将图片代理转为 Base64，确保前端 Canvas 可绘制
        if (!safeMovie.backdrop_path) throw new Error("电影无剧照");
        const imageUrl = `https://image.tmdb.org/t/p/w780${safeMovie.backdrop_path}`;
        const imageRes = await fetch(imageUrl);
        if (!imageRes.ok) throw new Error("剧照下载失败");
        const imageBuffer = await imageRes.arrayBuffer();
        const imageBase64 = `data:image/jpeg;base64,${Buffer.from(imageBuffer).toString('base64')}`;

        res.status(200).json({
            title: safeMovie.title,
            year: safeMovie.year,
            image: imageBase64,
            quote: quote
        });

    } catch (error) {
        console.error("服务端错误:", error);
        // 如果出错，返回最基本的兜底数据，确保页面不崩溃、不显示 undefined
        res.status(200).json({
            title: fallbackMovie.title,
            year: fallbackMovie.year,
            // 这里提供一个透明图片的 Base64 作为剧照兜底
            image: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
            quote: fallbackQuote
        });
    }
}
