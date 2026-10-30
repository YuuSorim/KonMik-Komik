
// ID: ext_siikomik_id
// NAME: Siikomik
// TYPE: comic
// VERSION: 1.0.0
// COLOR: #7B61A8
// ICON: https://siikomik.id/favicon.ico
// REFERER: https://siikomik.id/

const BASE = 'https://siikomik.id';

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
  'Referer': BASE + '/'
};

async function fetchHtml(url) {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error('HTTP ' + response.status);
  return await response.text();
}

function clean(text) {
  return (text || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#8217;|&#039;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getMatch(regex, html, fallback = '') {
  const match = html.match(regex);
  return match ? clean(match[1]) : fallback;
}

function absoluteUrl(url) {
  if (!url) return '';
  if (url.startsWith('//')) return 'https:' + url;
  if (url.startsWith('/')) return BASE + url;
  return url;
}

var KonmikExtension = {
  async getList(page, query, filters) {
    const url = query
      ? BASE + '/?s=' + encodeURIComponent(query)
      : BASE + '/';

    const html = await fetchHtml(url);
    const mangaList = [];
    const seen = new Set();

    const anchorRegex = /<a\b([^>]*href=["']([^"']*\/komik\/[^"']+)["'][^>]*)>([\s\S]*?)<\/a>/gi;

    let match;
    while ((match = anchorRegex.exec(html)) !== null) {
      const attrs = match[1];
      const link = absoluteUrl(match[2]);
      const inside = match[3];

      if (!/\/komik\/[^/]+\/?$/i.test(link)) continue;
      if (seen.has(link)) continue;

      const image = inside.match(/<img\b[^>]*(?:data-src|data-lazy-src|src)=["']([^"']+)["'][^>]*>/i);
      const title = getMatch(/<img\b[^>]*alt=["']([^"']+)["']/i, inside) ||
        getMatch(/title=["']([^"']+)["']/i, attrs) ||
        clean(inside);

      if (!title) continue;

      seen.add(link);
      mangaList.push({
        id: link,
        title: title,
        cover_url: image ? absoluteUrl(image[1]) : '',
        rating: '-',
        views: '-'
      });
    }

    return { manga_list: mangaList };
  },

  async getDetail(urlPath) {
    const url = absoluteUrl(urlPath);
    const html = await fetchHtml(url);

    const title =
      getMatch(/<h1[^>]*>([\s\S]*?)<\/h1>/i, html) ||
      getMatch(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)/i, html, 'Siikomik');

    const cover =
      getMatch(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)/i, html) ||
      getMatch(/<img[^>]+class=["'][^"']*wp-post-image[^"']*["'][^>]+src=["']([^"']+)/i, html);

    const description =
      getMatch(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)/i, html) ||
      getMatch(/<div[^>]*class=["'][^"']*entry-content[^"']*["'][\s\S]*?<p>([\s\S]*?)<\/p>/i, html);

    const genres = [];
    const genreRegex = /<a\b[^>]*href=["'][^"']*\/genre\/[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
    let genreMatch;
    while ((genreMatch = genreRegex.exec(html)) !== null) {
      const genre = clean(genreMatch[1]);
      if (genre && !genres.includes(genre)) genres.push(genre);
    }

    const chapters = [];
    const chapterRegex = /<a\b[^>]*href=["']([^"']*\/chapter-[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    const seenChapters = new Set();

    let chapterMatch;
    while ((chapterMatch = chapterRegex.exec(html)) !== null) {
      const chapterUrl = absoluteUrl(chapterMatch[1]);
      const chapterTitle = clean(chapterMatch[2]);

      if (!chapterTitle || seenChapters.has(chapterUrl)) continue;
      seenChapters.add(chapterUrl);

      chapters.push({
        id: chapterUrl,
        title: chapterTitle,
        date: '-'
      });
    }

    return {
      title: title,
      cover_url: absoluteUrl(cover),
      description: description || 'Tidak ada deskripsi.',
      rating: '-',
      views: '-',
      genres: genres,
      author: '-',
      artist: '-',
      chapters: chapters
    };
  },

  
  async getChapterImages(chapterUrl) {
    const html = await fetchHtml(absoluteUrl(chapterUrl));

    const images = [];
    const imageRegex = /<img\b[^>]*(?:data-src|data-lazy-src|src)=["']([^"']+)["'][^>]*>/gi;
    let match;

    while ((match = imageRegex.exec(html)) !== null) {
      const imageUrl = absoluteUrl(match[1]);

      if (!imageUrl || imageUrl.startsWith('data:')) continue;
      if (!/\.(jpg|jpeg|png|webp)(\?|$)/i.test(imageUrl)) continue;
      if (images.includes(imageUrl)) continue;

      images.push(imageUrl);
    }

    return images;
  }
};
