export default async function handler(req, res) {
    const TMDB_KEY = process.env.TMDB_API_KEY;
    const OR_KEY   = process.env.OPENROUTER_API_KEY;

    // 从 query 读取参数
    const mood    = req.query?.mood    || 'random';   // 心情：happy / sad / courage / lonely / random
    const mode    = req.query?.mode    || 'random';   // 模式：random / today（今日同日）

    const fallbackPool = [
        { zh: "生活就像一盒巧克力，你永远不知道下一块是什么味道。", en: "Life is like a box of chocolates.", fortune: "今天会有意外的惊喜降临，敞开心扉去接受吧。" },
        { zh: "你跳，我也跳。", en: "You jump, I jump.", fortune: "今天适合迈出那一步，有人会与你同行。" },
        { zh: "明天又是新的一天。", en: "Tomorrow is another day.", fortune: "不必纠结今日的遗憾，明天的你会更好。" },
        { zh: "人生没有彩排，每天都是现场直播。", en: "Life has no rehearsal.", fortune: "认真对待今天每一刻，它不会重来。" },
    ];
    const fallbackQuote = fallbackPool[Math.floor(Math.random() * fallbackPool.length)];

    // 心情 → 台词风格映射
    const moodStyleMap = {
        happy:   "选一句轻松欢快、令人微笑的台词",
        sad:     "选一句关于思念、告别或失去的动人台词",
        courage: "选一句关于勇气、希望或重新出发的台词",
        lonely:  "选一句关于孤独、等待或自我和解的台词",
        random:  ["选一句关于爱情或告别的经典台词","选一句充满哲理、引人深思的台词","选一句轻松幽默、令人难忘的台词","选一句关于勇气或希望的台词","选一句描写孤独或思念的台词"][Math.floor(Math.random()*5)],
    };
    const moodStyle = moodStyleMap[mood] || moodStyleMap.random;

    // 心情 → 运势语气映射
    const moodFortuneMap = {
        happy:   "用轻松愉快的语气",
        sad:     "用温柔治愈的语气，给予安慰",
        courage: "用鼓励振奋的语气",
        lonely:  "用温暖陪伴的语气，让人感到被理解",
        random:  "用充满诗意的语气",
    };
    const moodFortuneTone = moodFortuneMap[mood] || moodFortuneMap.random;

    try {
        const now   = new Date();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day   = String(now.getDate()).padStart(2, '0');
        const today = now.toISOString().split('T')[0];

        let movie;

        if (mode === 'today') {
            // ── 今日同月同日上映的电影 ──────────────────────────────────────
            // TMDB discover 支持 primary_release_date.gte / .lte 精确筛选
            // 遍历多个年份区间，找到有图片的电影
            let todayMovies = [];
            for (let startYear = 1970; startYear <= now.getFullYear(); startYear += 10) {
                const endYear = Math.min(startYear + 9, now.getFullYear());
                const gte = `${startYear}-${month}-${day}`;
                const lte = `${endYear}-${month}-${day}`;
                const r = await fetch(
                    `https://api.themoviedb.org/3/discover/movie?sort_by=vote_count.desc&language=zh-CN&primary_release_date.gte=${gte}&primary_release_date.lte=${lte}&vote_count.gte=200`,
                    { headers: { Authorization: `Bearer ${TMDB_KEY}` } }
                );
                const d = await r.json();
                if (d.results?.length) todayMovies.push(...d.results);
            }
            // 按热度排序，随机取前 10 中的一个，增加多样性
            todayMovies.sort((a, b) => b.vote_count - a.vote_count);
            const pool = todayMovies.slice(0, 10);
            movie = pool[Math.floor(Math.random() * pool.length)];
        }

        if (!movie) {
            // ── 普通随机模式（或 today 模式未找到结果时的降级）────────────
            const page       = Math.floor(Math.random() * 30) + 1;
            const movieIndex = Math.floor(Math.random() * 20);
            const r = await fetch(
                `https://api.themoviedb.org/3/discover/movie?sort_by=popularity.desc&page=${page}&language=zh-CN&primary_release_date.gte=2000-01-01&primary_release_date.lte=${today}&vote_count.gte=500`,
                { headers: { Authorization: `Bearer ${TMDB_KEY}` } }
            );
            const d = await r.json();
            movie = d.results[movieIndex] || d.results[0];
        }

        // ── 并行拉取：电影详情 + 图片列表 ───────────────────────────────────
        const [detailRes, imagesRes] = await Promise.allSettled([
            fetch(`https://api.themoviedb.org/3/movie/${movie.id}?language=zh-CN`,
                { headers: { Authorization: `Bearer ${TMDB_KEY}` } }
            ).then(r => r.json()),
            fetch(`https://api.themoviedb.org/3/movie/${movie.id}/images`,
                { headers: { Authorization: `Bearer ${TMDB_KEY}` } }
            ).then(r => r.json()),
        ]);

        const detail    = detailRes.status  === 'fulfilled' ? detailRes.value  : null;
        const imageData = imagesRes.status  === 'fulfilled' ? imagesRes.value  : null;

        const overview    = detail?.overview || movie.overview || "";
        const genres      = detail?.genres?.map(g => g.name).join("、") || "";
        const releaseYear = (movie.release_date || "").split('-')[0];
        const releaseDate = movie.release_date || "";

        // ── 选最佳图片 & 推算焦点 ────────────────────────────────────────────
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
        const bestPoster    = pickBest(posters);
        const backdropPath  = bestBackdrop?.file_path || movie.backdrop_path || null;
        const backdropFocal = bestBackdrop ? focalFromSize(bestBackdrop.width, bestBackdrop.height) : { x: 50, y: 38 };
        const posterPath    = bestPoster?.file_path   || movie.poster_path   || null;
        const posterFocal   = bestPoster   ? focalFromSize(bestPoster.width,   bestPoster.height)   : { x: 50, y: 28 };

        async function fetchBase64(path) {
            if (!path) return null;
            try {
                const r   = await fetch(`https://image.tmdb.org/t/p/w1280${path}`);
                const buf = await r.arrayBuffer();
                return `data:image/jpeg;base64,${Buffer.from(buf).toString('base64')}`;
            } catch { return null; }
        }

        const [backdropB64, posterB64] = await Promise.all([
            fetchBase64(backdropPath),
            fetchBase64(posterPath),
        ]);

        // ── AI：台词 + 今日运势 ───────────────────────────────────────────────
        const nonce        = Math.random().toString(36).substring(2, 9);
        const todayLabel   = `${month}月${day}日`;
        const isTodayMode  = mode === 'today';

        const aiPrompt = `你是电影台词专家，同时也是一位充满诗意的占卜师。

电影信息：
- 片名：《${movie.title}》（${releaseYear}年${isTodayMode ? `，${releaseDate}上映` : ''}）
- 类型：${genres || "剧情"}
- 简介：${overview.slice(0, 200) || "暂无"}
${isTodayMode ? `- 特别说明：这部电影正是在历史上的今天（${todayLabel}）上映的` : ''}

任务一：台词
- 从该电影中选一句真实存在的经典台词（不可杜撰）
- ${moodStyle}
- 随机参考号：${nonce}

任务二：今日运势
- 根据这句台词的意境，为今天（${todayLabel}）写一句"今日运势"
- ${moodFortuneTone}
- 15–25 字，像塔罗牌解读一样充满画面感
${isTodayMode ? `- 可以提到"今天是《${movie.title}》上映X周年"这一巧合，增加仪式感` : ''}

仅输出以下 JSON，不要任何其他内容：
{"zh":"中文台词","en":"English quote","fortune":"今日运势文字"}`;

        const aiRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${OR_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "google/gemini-2.0-flash-001",
                temperature: 1.0,
                messages: [{ role: "user", content: aiPrompt }]
            })
        });

        let quote = fallbackQuote;
        if (aiRes.ok) {
            const aiData = await aiRes.json();
            const raw    = aiData.choices?.[0]?.message?.content?.trim() || "";
            try {
                const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
                if (parsed.zh && parsed.en) quote = { ...fallbackQuote, ...parsed };
            } catch (e) { console.error("Quote parse error:", raw); }
        }

        res.status(200).json({
            title:      movie.title || "未知电影",
            year:       releaseYear,
            releaseDate,
            isTodayMovie: isTodayMode,
            todayLabel,
            images: {
                backdrop: { b64: backdropB64, focal: backdropFocal },
                poster:   { b64: posterB64,   focal: posterFocal   },
            },
            quote,
        });

    } catch (error) {
        console.error("Handler error:", error);
        res.status(200).json({
            title: "Error", year: "", releaseDate: "", isTodayMovie: false, todayLabel: "",
            images: {
                backdrop: { b64: null, focal: { x: 50, y: 38 } },
                poster:   { b64: null, focal: { x: 50, y: 28 } },
            },
            quote: fallbackQuote,
        });
    }
}
