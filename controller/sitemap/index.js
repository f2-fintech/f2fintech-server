const Blog = require("../../model/blogs/index");

exports.getSitemap = async (req, res) => {
  try {
    const staticRoutes = [
      { path: '/', priority: '1.0', changefreq: 'daily' },
      { path: '/personal-loan', priority: '0.9', changefreq: 'weekly' },
      { path: '/business-loan', priority: '0.9', changefreq: 'weekly' },
      { path: '/home-loan', priority: '0.9', changefreq: 'weekly' },
      { path: '/doctor-loan', priority: '0.9', changefreq: 'weekly' },
      { path: '/loan-against-property', priority: '0.9', changefreq: 'weekly' },
      { path: '/unsecured-business-loan', priority: '0.8', changefreq: 'weekly' },
      { path: '/business-loan-for-women', priority: '0.8', changefreq: 'weekly' },
      { path: '/ecommerce-business-loan', priority: '0.8', changefreq: 'weekly' },
      { path: '/check-cibil-score', priority: '0.8', changefreq: 'weekly' },
      { path: '/our-products', priority: '0.8', changefreq: 'weekly' },
      { path: '/providers', priority: '0.7', changefreq: 'weekly' },
      { path: '/eligibility-criteria', priority: '0.7', changefreq: 'monthly' },
      { path: '/blogs', priority: '0.8', changefreq: 'daily' },
      { path: '/personal-loan-blogs', priority: '0.7', changefreq: 'weekly' },
      { path: '/business-loan-blogs', priority: '0.7', changefreq: 'weekly' },
      { path: '/overdraft-blogs', priority: '0.7', changefreq: 'weekly' },
      { path: '/about-us', priority: '0.6', changefreq: 'monthly' },
      { path: '/get-in-touch', priority: '0.7', changefreq: 'monthly' },
      { path: '/faq', priority: '0.7', changefreq: 'monthly' },
      { path: '/channel-partners', priority: '0.6', changefreq: 'monthly' },
      { path: '/privacy-policy', priority: '0.4', changefreq: 'yearly' },
      { path: '/terms-and-condition', priority: '0.4', changefreq: 'yearly' },
      { path: '/brochures', priority: '0.5', changefreq: 'monthly' },
      { path: '/feedback', priority: '0.5', changefreq: 'monthly' }
    ];

    // Fetch blogs from DB
    const blogs = await Blog.findAll({
      attributes: ["route", "date"],
      order: [["id", "DESC"]]
    });

    const baseUrl = 'https://f2fintech.com';
    const currentDate = new Date().toISOString().split('T')[0];

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<?xml-stylesheet type="text/xsl" href="/sitemap.xsl"?>\n`;
    xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

    // 1. Add static routes
    staticRoutes.forEach(route => {
      xml += `  <url>\n`;
      xml += `    <loc>${baseUrl}${route.path}</loc>\n`;
      xml += `    <lastmod>${currentDate}</lastmod>\n`;
      xml += `    <changefreq>${route.changefreq}</changefreq>\n`;
      xml += `    <priority>${route.priority}</priority>\n`;
      xml += `  </url>\n`;
    });

    // 2. Add dynamic blog routes
    blogs.forEach(blog => {
      let routePath = blog.route || '';
      if (routePath) {
        // Extract the clean slug part from route (removing leading slashes and optional /blogs/ prefix)
        const slug = routePath.replace(/^\/?(blogs\/)?/, '');
        routePath = `/blogs/${slug}`;
        
        let lastmodDate = currentDate;
        if (blog.date) {
          try {
            const parsed = new Date(blog.date);
            if (!isNaN(parsed.getTime())) {
              lastmodDate = parsed.toISOString().split('T')[0];
            }
          } catch (e) {
            // fallback to currentDate
          }
        }

        xml += `  <url>\n`;
        xml += `    <loc>${baseUrl}${routePath}</loc>\n`;
        xml += `    <lastmod>${lastmodDate}</lastmod>\n`;
        xml += `    <changefreq>weekly</changefreq>\n`;
        xml += `    <priority>0.7</priority>\n`;
        xml += `  </url>\n`;
      }
    });

    xml += `</urlset>\n`;

    res.header('Content-Type', 'application/xml');
    res.status(200).send(xml);
  } catch (error) {
    console.error("Error generating dynamic sitemap:", error);
    res.status(500).send("Error generating sitemap");
  }
};
