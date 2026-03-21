export default async function handler(req, res) {
    const TMDB_KEY = process.env.TMDB_API_KEY;
    const OR_KEY   = process.env.OPENROUTER_API_KEY;

    const mood = req.query?.mood || 'random';
    const mode = req.query?.mode || 'random';

    const fallbackPool = [
        { zh: "生活就像一盒巧克力，你永远不知道下一块是什么味道。", en: "Life is like a box of chocolates.", fortune: "今天的你，就是那颗最好吃的巧克力。" },
        { zh: "你跳，我也跳。", en: "You jump, I jump.", fortune: "今天会有人陪你一起做傻事。" },
        { zh: "明天又是新的一天。", en: "Tomorrow is another day.", fortune: "今天的烦恼到明天会变成一个故事开头。" },
        { zh: "人生没有彩排，每天都是现场直播。", en: "Life has no rehearsal.", fortune: "今天直播效果出乎意料地好，放松去演吧。" },
    ];
    const fallbackQuote = fallbackPool[Math.floor(Math.random() * fallbackPool.length)];

    const moodStyleMap = {
        happy:   "选一句轻松欢快、令人微笑的台词",
        sad:     "选一句关于思念、告别或失去的动人台词",
        courage: "选一句关于勇气、希望或重新出发的台词",
        lonely:  "选一句关于孤独、等待或自我和解的台词",
        random:  ["选一句关于爱情或告别的经典台词","选一句充满哲理的台词","选一句轻松幽默的台词","选一句关于勇气的台词","选一句关于孤独的台词"][Math.floor(Math.random()*5)],
    };
    const moodStyle = moodStyleMap[mood] || moodStyleMap.random;

    try {
        const now   = new Date();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day   = String(now.getDate()).padStart(2, '0');
        const today = now.toISOString().split('T')[0];

        let movie;

        if (mode === 'today') {
            let todayMovies = [];
            for (let startYear = 1970; startYear <= now.getFullYear(); startYear += 10) {
                const endYear = Math.min(startYear + 9, now.getFullYear());
                const r = await fetch(
                    `https://api.themoviedb.org/3/discover/movie?sort_by=vote_count.desc&language=zh-CN&primary_release_date.gte=${startYear}-${month}-${day}&primary_release_date.lte=${endYear}-${month}-${day}&vote_count.gte=200`,
                    { headers: { Authorization: `Bearer ${TMDB_KEY}` } }
                );
                const d = await r.json();
                if (d.results?.length) todayMovies.push(...d.results);
            }
            todayMovies.sort((a, b) => b.vote_count - a.vote_count);
            const pool = todayMovies.slice(0, 10);
            movie = pool[Math.floor(Math.random() * pool.length)];
        }

        if (!movie) {
            const page  = Math.floor(Math.random() * 30) + 1;
            const idx   = Math.floor(Math.random() * 20);
            const r     = await fetch(
                `https://api.themoviedb.org/3/discover/movie?sort_by=popularity.desc&page=${page}&language=zh-CN&primary_release_date.gte=2000-01-01&primary_release_date.lte=${today}&vote_count.gte=500`,
                { headers: { Authorization: `Bearer ${TMDB_KEY}` } }
            );
            const d = await r.json();
            movie = d.results[idx] || d.results[0];
        }

        const [detailRes, imagesRes] = await Promise.allSettled([
            fetch(`https://api.themoviedb.org/3/movie/${movie.id}?language=zh-CN`,
                { headers: { Authorization: `Bearer ${TMDB_KEY}` } }).then(r => r.json()),
            fetch(`https://api.themoviedb.org/3/movie/${movie.id}/images`,
                { headers: { Authorization: `Bearer ${TMDB_KEY}` } }).then(r => r.json()),
        ]);

        const detail    = detailRes.status  === 'fulfilled' ? detailRes.value  : null;
        const imageData = imagesRes.status  === 'fulfilled' ? imagesRes.value  : null;

        const overview    = detail?.overview || movie.overview || "";
        const genres      = detail?.genres?.map(g => g.name).join("、") || "";
        const releaseYear = (movie.release_date || "").split('-')[0];
        const releaseDate = movie.release_date || "";

        const backdrops = imageData?.backdrops || [];
        const posters   = imageData?.posters   || [];

        function pickBest(list) {
            const noLang = list.filter(img => !img.iso_639_1);
            const pool   = noLang.length > 0 ? noLang : list;
            return pool.sort((a, b) => b.vote_average - a.vote_average)[0] || null;
        }
        function focalFromSize(w, h) {
            const ar = w / h;
            if (ar < 0.8)  return { x: 50, y: 28 };
            if (ar < 1.5)  return { x: 50, y: 45 };
            if (ar <= 2.4) return { x: 50, y: 38 };
            return               { x: 50, y: 42 };
        }

        const bestBackdrop  = pickBest(backdrops);
        const backdropPath  = bestBackdrop?.file_path || movie.backdrop_path || null;
        const backdropFocal = bestBackdrop ? focalFromSize(bestBackdrop.width, bestBackdrop.height) : { x: 50, y: 38 };

        async function fetchBase64(path) {
            if (!path) return null;
            try {
                const r   = await fetch(`https://image.tmdb.org/t/p/w1280${path}`);
                const buf = await r.arrayBuffer();
                return `data:image/jpeg;base64,${Buffer.from(buf).toString('base64')}`;
            } catch { return null; }
        }

        const backdropB64 = await fetchBase64(backdropPath);

        // ── AI 提示词 ─────────────────────────────────────────────────────────
        const nonce      = Math.random().toString(36).substring(2, 9);
        const todayLabel = `${month}月${day}日`;
        const isTodayM   = mode === 'today';

        // 今日运势只在 today 模式下生成
        const fortuneInstruction = isTodayM ? `
任务二：今日运势（仅在今日上映模式下）
- 根据这句台词，为今天写一句"今日运势"
- 风格要求：温暖治愈 + 带一点小幽默，像一个很懂你的朋友说的话
- 可以调侃、可以有点哲学、可以带点小惊喜，但不能说教、不能鸡汤
- 15–30 字，不需要引用台词原文，说你自己的话
- 可以提到今天是《${movie.title}》上映纪念日这个巧合，但要自然，不要生硬
- 示例风格："今天宇宙特别照顾你，但它只照顾到下午三点，之后靠自己。"
` : '';

        const aiPrompt = `你是电影台词专家。

电影：《${movie.title}》（${releaseYear}年${isTodayM ? `，历史上的今天 ${todayLabel} 上映` : ''}）
类型：${genres || "剧情"}
简介：${overview.slice(0, 200) || "暂无"}

任务一：台词
- 选一句该电影中真实存在的经典台词（不可杜撰）
- ${moodStyle}
- 参考号：${nonce}
${fortuneInstruction}
仅输出 JSON，不要其他内容：
${isTodayM
    ? '{"zh":"中文台词","en":"English quote","fortune":"今日运势"}'
    : '{"zh":"中文台词","en":"English quote"}'
}`;

        const aiRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${OR_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "google/gemini-2.0-flash-001",
                temperature: 1.0,
                messages: [{ role: "user", content: aiPrompt }]
            })
        });

        let quote = { ...fallbackQuote };
        if (aiRes.ok) {
            const aiData = await aiRes.json();
            const raw    = aiData.choices?.[0]?.message?.content?.trim() || "";
            try {
                const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
                if (parsed.zh && parsed.en) quote = parsed;
            } catch (e) { console.error("Quote parse error:", raw); }
        }

        res.status(200).json({
            title: movie.title || "未知电影",
            year:  releaseYear,
            releaseDate,
            isTodayMovie: isTodayM,
            todayLabel,
            image: { b64: backdropB64, focal: backdropFocal },
            quote,
        });

    } catch (error) {
        console.error("Handler error:", error);
        res.status(200).json({
            title: "Error", year: "", releaseDate: "", isTodayMovie: false, todayLabel: "",
            image: { b64: null, focal: { x: 50, y: 38 } },
            quote: fallbackQuote,
        });
    }
}
