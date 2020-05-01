import { uploadToS3 } from '@/awsS3Manager';
import { acquireProxy } from '@/proxyPool';
import { crawlerConfig } from '@Config';
import { Article } from '@Models';
import { DiamondCrawler, Proxy } from '@Types';
import { cleanPageStyle, getCrawler, takeScreenShot, useProxy } from '@Utils';
import { promises as fs } from 'fs';
import * as path from 'path';
import { Page } from 'puppeteer';
import { Crawler } from './types/Crawler';

export async function crawlArticle(url: string): Promise<Article> {
  const crawler = await getCrawler(url);
  if (crawler === null) {
    throw new Error('Crawler for this URL cannot be found.');
  }

  let urlPage: Page;
  let proxy: Proxy;
  if (crawler.useProxy) {
    [urlPage, proxy] = await Promise.all([
      crawler.puppeteerPool.acquire(),
      acquireProxy(crawler.proxyOptions),
    ]);
    if (proxy !== null) {
      await useProxy(urlPage, proxy);
    }
  } else {
    urlPage = await crawler.puppeteerPool.acquire();
  }
  await urlPage.setViewport({ width: 1440, height: 768 });
  let pageDeleted = false;

  // Post processing
  try {
    const [article, crawledSuccessfully] = await crawler.crawlArticle(
      urlPage,
      url
    );

    if (article !== null && crawledSuccessfully) {
      if (crawlerConfig.takeScreenshot) {
        const filename = `${encodeURIComponent(url)}_${Math.floor(
          Date.now() / 60000
        )}`;

        let [file, p] = await takeScreenShot(urlPage, filename);
        const fileKey = await uploadToS3({
          file,
          key: `${filename}.jpeg`,
          path: p,
          deleteOriginalFile: true,
        });
        article.screenshot = fileKey;

        await cleanPageStyle(urlPage);
        [file, p] = await takeScreenShot(urlPage, `${filename}.clean_style`);
        await crawler.puppeteerPool.destroy(urlPage);
        pageDeleted = true;
        await uploadToS3({
          file,
          key: `${filename}.clean_style.jpeg`,
          path: p,
          deleteOriginalFile: true,
        });
      }

      article.status = 'crawled';
      await article.save();
    }

    return article;
  } catch (err) {
    throw err;
  } finally {
    if (!pageDeleted) {
      await crawler.puppeteerPool.destroy(urlPage);
    }
  }
}

export async function getCrawlingTask(crawler: Crawler): Promise<Article[]> {
  if (crawler instanceof DiamondCrawler) {
    const page = await crawler.puppeteerPool.acquire();
    const urlList = await crawler.getArticleList(page);
    await crawler.puppeteerPool.destroy(page);

    return Promise.all(urlList.map((url: string) => crawlArticle(url)));
  }
  return;
}
export async function crawlAll(): Promise<void> {
  const tasks = global.crawlers.map((crawler: DiamondCrawler) =>
    getCrawlingTask(crawler)
  );

  try {
    await Promise.all(tasks);
  } catch (err) {}

  setTimeout(crawlAll, crawlerConfig.interval);
}

export async function initializeCrawlerManager(crawl = true): Promise<void> {
  const crawlers: DiamondCrawler[] = [];
  global.domainToCrawlerMap = {};

  const dirs = await fs.readdir(path.join(__dirname, 'sites'));
  for (const dir of dirs) {
    let sites = await fs.readdir(path.join(__dirname, 'sites', dir));
    sites = sites.filter((site) => site.endsWith('.js'));

    // Built-in crawlers
    for (const site of sites) {
      const siteExports = await import(
        path.join(__dirname, 'sites', dir, site)
      );
      for (const siteExport in siteExports) {
        if (typeof siteExports[siteExport] === 'function') {
          try {
            const crawler = new siteExports[siteExport]();
            if (crawler instanceof DiamondCrawler) {
              await crawler.init();
              crawlers.push(crawler as DiamondCrawler);
              for (const domain of crawler.domains) {
                global.domainToCrawlerMap[domain] = crawler;
              }
            }
          } catch (err) {}
        }
      }
    }

    // TODO: RssHub
  }

  global.crawlers = crawlers;

  if (crawl) {
    crawlAll();
  }
}

export default initializeCrawlerManager;
