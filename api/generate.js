export default async function handler(req, res) {
    // 从 Vercel 环境变量中读取你的密钥
    const TMDB_KEY = process.env.TMDB_API_KEY;
    const OR_KEY = process.env.OPENROUTER_API_KEY;

    try {
        // 1. 计算时间范围：获取近 10 年（2016-2026）的热门电影
        const today = new Date().toISOString().split('T')[0]; 
        const tenYearsAgo = "2016-01-01";
        
        // 随机页码（1-10页，确保获取的是相对热门且高质量的电影）
        const page = Math.floor(Math.random() * 10) + 1;

        // 2. 从 TMDB 获取电影列表
        const tmdbRes = await fetch(
            `https://api.themoviedb.org/3/discover/movie?sort_by=popularity.desc&page=${page}&language=zh-CN&primary_release_date.gte=${tenYearsAgo}&primary_release_date.lte=${today}`, 
            {
                headers: { Authorization: `Bearer ${TMDB_KEY}` }
            }
        );
        const tmdbData = await tmdbRes.json();
        
        // 随机抽取一部电影
        const movie = tmdbData.results[Math.floor(Math.random() * tmdbData.results.length)];

        // 3. 调用 OpenRouter AI 获取该电影的经典 Emo 台词
        const aiRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${OR_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                "model": "google/gemini-2.0-flash-001", // 或者你喜欢的其他模型
                "messages": [
                    {
                        "role": "user",
                        "content": `你是一个忧郁且文艺的电影评论家。请给出电影《${movie.title}》中一句最经典、充满emo感或文艺哲理的台词。
                        注意：
                        1. 必须是该电影真实的台词或核心意境。
                        2. 只要输出 JSON 格式：{"zh": "中文台词", "en": "英文台词"}。
                        3. 不要输出任何多余的解释、Markdown 标签或文字。`
                    }
                ]
            })
        });

        const aiData = await aiRes.json();
        let content = aiData.choices[0].message.content.trim();
        
        // 清理 AI 可能返回的 Markdown 代码块标签
        content = content.replace(/```json|```/g, '');

        // 4. 解析台词并返回给前端
        const quote = JSON.parse(content);

        res.status(200).json({
            title: movie.title,
            year: movie.release_date ? movie.release_date.split('-')[0] : "未知",
            image: `https://image.tmdb.org/t/p/original${movie.backdrop_path}`,
            quote: quote
        });

    } catch (error) {
        console.error("Server Error:", error);
        res.status(500).json({ error: "电影感生成失败，请稍后再试" });
    }
}
