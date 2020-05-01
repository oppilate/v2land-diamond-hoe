/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-unused-vars */
import { DiamondCrawler, Proxy, ProxyCrawler } from '@Types';
import { S3 } from 'aws-sdk';
import { Pool } from 'generic-pool';
import { Page } from 'puppeteer';
import { Sequelize } from 'sequelize-typescript';
import { Crawler } from './types/Crawler';

declare global {
  namespace NodeJS {
    interface Global {
      puppeteerPool: Pool<Page>;
      sequelize: Sequelize;
      crawlers: Crawler[];
      domainToCrawlerMap: Record<string, DiamondCrawler>;
      s3: S3;
      proxies: Proxy[];
      proxyCrawlers: ProxyCrawler[];
    }
  }
}
