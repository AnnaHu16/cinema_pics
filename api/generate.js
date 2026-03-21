export default async function handler(req, res) {
    const TMDB_KEY = process.env.TMDB_API_KEY;
    const OR_KEY = process.env.OPENROUTER_API_KEY;

    // 备用台词池，随机抽取，避免每次都是同一句
    const fallbackPool = [
        { zh: "生活就像一盒巧克力，你永远不知道下一块是什么味道。", en: "Life is like a box of chocolates. You never know what you're gonna get." },
        { zh: "你跳，我也跳。", en: "You jump, I jump." },
        { zh: "明天又是新的一天。", en: "Tomorrow is another day." },
        { zh: "友谊是世上最珍贵的礼物。", en: "Friendship is the greatest gift of all." },
        { zh: "人生没有彩排，每天都是现场直播。", en: "Life has no rehearsal. Every day is live." },
    ];
    const fallbackQuote = fallbackPool[Math.floor(Math.random() * fallbackPool.length)];

    try {
        // 1. 从前 30 页热门电影中随机挑选，扩大多样性
        const page = Math.floor(Math.random() * 30) + 1;
        const movieIndex = Math.floor(Math.random() * 20);
        const today = new Date().toISOString().split('T')[0];

        const tmdbRes = await fetch(
            `https://api.themoviedb.org/3/discover/movie?sort_by=popularity.desc&page=${page}&language=zh-CN&primary_release_date.gte=2000-01-01&primary_release_date.lte=${today}&vote_count.gte=500`,
            { headers: { Authorization: `Bearer ${TMDB_KEY}` } }
        );
        const tmdbData = await tmdbRes.json();
        const movie = tmdbData.results[movieIndex] || tmdbData.results[0];

        // 2. 获取电影详情（简介、类型），给 AI 更多上下文
        let movieDetail = null;
        try {
            const detailRes = await fetch(
                `https://api.themoviedb.org/3/movie/${movie.id}?language=zh-CN`,
                { headers: { Authorization: `Bearer ${TMDB_KEY}` } }
            );
            movieDetail = await detailRes.json();
        } catch (e) { /* 详情获取失败时降级 */ }

        const overview = movieDetail?.overview || movie.overview || "";
        const genres = movieDetail?.genres?.map(g => g.name).join("、") || "";
        const releaseYear = (movie.release_date || "").split('-')[0];

        // 3. 随机选择台词风格，让 AI 多样输出
        const styleOptions = [
            "选一句关于爱情或告别的经典台词",
            "选一句充满哲理、引人深思的台词",
            "选一句轻松幽默、令人难忘的台词",
            "选一句关于勇气或希望的台词",
            "选一句描写孤独或思念的台词",
        ];
        const style = styleOptions[Math.floor(Math.random() * styleOptions.length)];
        const nonce = Math.random().toString(36).substring(2, 9);

        const aiRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${OR_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "google/gemini-2.0-flash-001",
                temperature: 1.0,
                messages: [{
                    role: "user",
                    content: `你是一位电影台词专家。请从以下电影中找出一句真实存在的经典台词。

电影信息：
- 片名：《${movie.title}》（${releaseYear}年）
- 类型：${genres || "剧情"}
- 剧情简介：${overview.slice(0, 200) || "暂无"}

要求：
1. 台词必须是该电影中真实存在的原话，不可杜撰
2. ${style}
3. 随机参考号（帮助你给出多样化回答）：${nonce}
4. 若实在不确定该片台词，可提供该片最广为人知的一句

仅输出以下 JSON 格式，不要任何其他内容：
{"zh":"中文台词","en":"English quote"}`
                }]
            })
        });

        let quote = fallbackQuote;
        if (aiRes.ok) {
            const aiData = await aiRes.json();
            const raw = aiData.choices?.[0]?.message?.content?.trim() || "";
            const content = raw.replace(/```json|```/g, "").trim();
            try {
                const parsed = JSON.parse(content);
                if (parsed.zh && parsed.en) quote = parsed;
            } catch (e) {
                console.error("Quote parse error:", content);
            }
        }

        // 4. 优先用 backdrop，无则用 poster
        const imagePath = movie.backdrop_path || movie.poster_path;
        if (!imagePath) {
            return res.status(200).json({
                title: movie.title || "未知电影",
                year: releaseYear,
                image: "",
                quote,
            });
        }

        const imageUrl = `https://image.tmdb.org/t/p/w1280${imagePath}`;
        const imageRes = await fetch(imageUrl);
        const imageBuffer = await imageRes.arrayBuffer();
        const imageBase64 = `data:image/jpeg;base64,${Buffer.from(imageBuffer).toString("base64")}`;

        res.status(200).json({
            title: movie.title || "未知电影",
            year: releaseYear,
            image: imageBase64,
            quote,
        });

    } catch (error) {
        console.error("Handler error:", error);
        res.status(200).json({
            title: "Error",
            year: "",
            image: "",
            quote: fallbackQuote,
        });
    }
}
