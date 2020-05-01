import { ProxyOptions } from '../proxyPool';
import { SiteObj } from './SiteObj';
import { Page } from 'puppeteer';

export abstract class Crawler {
    abstract site: SiteObj;
    public domains: string[];
    public useProxy = false;
    public proxyOptions: ProxyOptions = {};

    public abstract async init(maxSitePageCount?: number): Promise<Crawler> ;


    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public abstract async getArticleList(page?: Page): Promise<string[]> ;
}
