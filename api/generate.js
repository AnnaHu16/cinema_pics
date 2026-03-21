export default async function handler(req, res) {
    const TMDB_KEY = process.env.TMDB_API_KEY;
    const OR_KEY   = process.env.OPENROUTER_API_KEY;

    const fallbackPool = [
        { zh: "生活就像一盒巧克力，你永远不知道下一块是什么味道。", en: "Life is like a box of chocolates. You never know what you're gonna get." },
        { zh: "你跳，我也跳。",   en: "You jump, I jump." },
        { zh: "明天又是新的一天。", en: "Tomorrow is another day." },
        { zh: "友谊是世上最珍贵的礼物。", en: "Friendship is the greatest gift of all." },
        { zh: "人生没有彩排，每天都是现场直播。", en: "Life has no rehearsal. Every day is live." },
    ];
    const fallbackQuote = fallbackPool[Math.floor(Math.random() * fallbackPool.length)];

    try {
        // 1. 随机选一部热门电影
        const page       = Math.floor(Math.random() * 30) + 1;
        const movieIndex = Math.floor(Math.random() * 20);
        const today      = new Date().toISOString().split('T')[0];

        const tmdbRes  = await fetch(
            `https://api.themoviedb.org/3/discover/movie?sort_by=popularity.desc&page=${page}&language=zh-CN&primary_release_date.gte=2000-01-01&primary_release_date.lte=${today}&vote_count.gte=500`,
            { headers: { Authorization: `Bearer ${TMDB_KEY}` } }
        );
        const tmdbData = await tmdbRes.json();
        const movie    = tmdbData.results[movieIndex] || tmdbData.results[0];

        // 2. 并行拉取：电影详情 + 所有图片（backdrop & poster）
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

        // ── 3. 选最佳图片 & 计算焦点位置 ──────────────────────────────────────
        //
        // TMDB /images 返回每张图的精确像素尺寸（width/height）和得分（vote_average）。
        // 用宽高比（AR）推断主体在画面中的典型位置，映射为 object-position 的 y%：
        //
        //  AR < 0.8  → 竖版海报：人脸通常在上 1/3，y=28
        //  0.8-1.5   → 接近方形：主体居中，y=45
        //  1.5-2.4   → 标准 16:9：三分法，主体在上 40%，y=38
        //  > 2.4     → 超宽银幕（2.35:1 anamorphic）：主体略偏中，y=42

        const backdrops = imageData?.backdrops || [];
        const posters   = imageData?.posters   || [];

        // 选最佳图片：优先无语言标注（纯画面无字幕），再按得分降序
        function pickBest(list) {
            const noLang = list.filter(img => !img.iso_639_1);
            const pool   = noLang.length > 0 ? noLang : list;
            return pool.sort((a, b) => b.vote_average - a.vote_average)[0] || null;
        }

        // 根据图片宽高比推算焦点坐标（x/y 均为百分比，对应 object-position）
        function focalFromSize(w, h) {
            const ar = w / h;
            if (ar < 0.8)  return { x: 50, y: 28 }; // 竖版海报：人脸偏上
            if (ar < 1.5)  return { x: 50, y: 45 }; // 方形：居中
            if (ar <= 2.4) return { x: 50, y: 38 }; // 标准 16:9：三分法
            return               { x: 50, y: 42 }; // 超宽银幕：略偏中
        }

        const bestBackdrop = pickBest(backdrops);
        const bestPoster   = pickBest(posters);

        const backdropPath  = bestBackdrop?.file_path || movie.backdrop_path || null;
        const backdropFocal = bestBackdrop
            ? focalFromSize(bestBackdrop.width, bestBackdrop.height)
            : { x: 50, y: 38 };

        const posterPath  = bestPoster?.file_path || movie.poster_path || null;
        const posterFocal = bestPoster
            ? focalFromSize(bestPoster.width, bestPoster.height)
            : { x: 50, y: 28 };

        // ── 4. 下载图片 → base64（backdrop & poster 并行下载）────────────────
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

        // ── 5. AI 生成台词 ────────────────────────────────────────────────────
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
            headers: { "Authorization": `Bearer ${OR_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "google/gemini-2.0-flash-001",
                temperature: 1.0,
                messages: [{ role: "user", content:
                    `你是一位电影台词专家。请从以下电影中找出一句真实存在的经典台词。\n\n` +
                    `电影信息：\n- 片名：《${movie.title}》（${releaseYear}年）\n` +
                    `- 类型：${genres || "剧情"}\n- 剧情简介：${overview.slice(0, 200) || "暂无"}\n\n` +
                    `要求：\n1. 台词必须是该电影中真实存在的原话，不可杜撰\n2. ${style}\n` +
                    `3. 随机参考号（帮助你给出多样化回答）：${nonce}\n` +
                    `4. 若实在不确定该片台词，可提供该片最广为人知的一句\n\n` +
                    `仅输出以下 JSON 格式，不要任何其他内容：\n{"zh":"中文台词","en":"English quote"}`
                }]
            })
        });

        let quote = fallbackQuote;
        if (aiRes.ok) {
            const aiData = await aiRes.json();
            const raw    = aiData.choices?.[0]?.message?.content?.trim() || "";
            try {
                const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
                if (parsed.zh && parsed.en) quote = parsed;
            } catch (e) { console.error("Quote parse error:", raw); }
        }

        // ── 6. 返回两套图片及各自焦点，前端根据当前比例选用 ─────────────────
        res.status(200).json({
            title: movie.title || "未知电影",
            year:  releaseYear,
            images: {
                backdrop: { b64: backdropB64, focal: backdropFocal },
                poster:   { b64: posterB64,   focal: posterFocal   },
            },
            quote,
        });

    } catch (error) {
        console.error("Handler error:", error);
        res.status(200).json({
            title: "Error", year: "",
            images: {
                backdrop: { b64: null, focal: { x: 50, y: 38 } },
                poster:   { b64: null, focal: { x: 50, y: 28 } },
            },
            quote: fallbackQuote,
        });
    }
}
