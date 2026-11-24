// ID: ext_komikdewasa_tes
// NAME: Komikdewasa TES
// TYPE: comic
// VERSION: 0.0.1
// COLOR: #FB8C00
// ICON: https://www.google.com/s2/favicons?domain=komikdewasa.art&sz=64
// REFERER: https://komikdewasa.art/

// Ekstensi diagnostik: menguji jalur mana yang bisa dibuka dari dalam aplikasi.
// Buka katalognya, hasil tes muncul sebagai pesan error. Kirim screenshot-nya.

const BASE = 'https://komikdewasa.art';
const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    'Referer': BASE + '/',
};

const TARGETS = [
    ['wp-json posts', '/wp-json/wp/v2/posts?per_page=1'],
    ['wp-json manga', '/wp-json/wp/v2/manga?per_page=1'],
    ['feed', '/feed/'],
    ['sitemap manga', '/wp-sitemap-posts-manga-1.xml'],
    ['beranda', '/'],
];

async function probe(name, path) {
    try {
        const res = await fetch(BASE + path, { headers: HEADERS });
        const body = await res.text();
        const head = body.substring(0, 3000);
        let verdict = 'OK';
        if (/Just a moment|cf-chl|challenge-platform|Attention Required/i.test(head)) verdict = 'CLOUDFLARE';
        else if (!res.ok) verdict = 'HTTP ' + res.status;
        else if (body.length < 50) verdict = 'KOSONG';
        return name + ': ' + verdict + ' (' + res.status + ', ' + body.length + ' byte)';
    } catch (e) {
        return name + ': ERROR ' + e;
    }
}

var KonmikExtension = {
    async getList(page, query, filters) {
        const lines = [];
        for (const t of TARGETS) lines.push(await probe(t[0], t[1]));
        throw new Error('HASIL TES\n' + lines.join('\n'));
    },
    async getDetail(url) {
        throw new Error('Ekstensi tes');
    },
    async getChapterImages(url) {
        return [];
    }
};
