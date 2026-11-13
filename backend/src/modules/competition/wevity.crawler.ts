import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as cheerio from 'cheerio';
import { CompetitionRepository } from './competition.repository';

const BASE_URL = 'https://www.wevity.com';
// 웹/모바일/IT 카테고리 (cidx=20)
const LIST_URL = `${BASE_URL}/?c=find&s=1&gub=1&cidx=20`;

@Injectable()
export class WevityCrawler {
  private readonly logger = new Logger(WevityCrawler.name);

  constructor(private readonly competitionRepository: CompetitionRepository) {}

  /** 매주 월요일 새벽 3시 (7일 주기) */
  @Cron('0 3 * * 1')
  async crawl(): Promise<void> {
    this.logger.log('위비티 크롤링 시작');
    try {
      const urls = await this.collectDetailUrls();
      this.logger.log(`수집된 공모전 수: ${urls.length}`);

      let success = 0;
      let skip = 0;

      for (const url of urls) {
        try {
          const data = await this.parseDetail(url);
          if (!data) {
            skip++;
            continue;
          }
          await this.competitionRepository.upsert(data);
          success++;
          // 요청 간격 (사이트 부하 방지)
          await this.sleep(500);
        } catch (err) {
          this.logger.warn(`파싱 실패: ${url} — ${(err as Error).message}`);
          skip++;
        }
      }

      const deactivated = await this.competitionRepository.deactivateExpired();
      this.logger.log(
        `완료 — 저장: ${success}, 건너뜀: ${skip}, 마감 비활성화: ${deactivated}`,
      );
    } catch (err) {
      this.logger.error('크롤링 실패', (err as Error).stack);
    }
  }

  /** 목록 페이지를 순회하며 상세 URL 수집 */
  private async collectDetailUrls(): Promise<string[]> {
    const urls: string[] = [];
    let page = 1;
    const MAX_PAGES = 3;  // ← 여기

    while (true) {
      const html = await this.fetchHtml(`${LIST_URL}&gp=${page}`);
      const $ = cheerio.load(html);

      const links: string[] = [];
      $('a[href*="gbn=view"]').each((_, el) => {
        const href = $(el).attr('href');
        if (href) {
          const url = href.startsWith('http') ? href : `${BASE_URL}${href}`;
          // 중복 제거 (같은 ix가 여러 번 나올 수 있음)
          if (!urls.includes(url) && !links.includes(url)) links.push(url);
        }
      });

      if (links.length === 0) break; // 더 이상 페이지 없음
      if (page >= MAX_PAGES) break;
      urls.push(...links);
      page++;

      // 페이지 간 간격
      await this.sleep(300);
    }

    return urls;
  }

  /** 상세 페이지에서 공모전 정보 파싱 */
  private async parseDetail(url: string): Promise<{
    title: string;
    organizer: string | null;
    category: string | null;
    startDate: string | null;
    endDate: string;
    sourceUrl: string;
  } | null> {
    const html = await this.fetchHtml(url);
    const $ = cheerio.load(html);

    // 제목
    const title =
      $('h1, .tit, .contest-title').first().text().trim() ||
      $('title').text().replace('위비티', '').trim();
    if (!title) return null;

    // 테이블 형태의 상세 정보 파싱
    // "접수기간", "주최/주관", "분야" 라벨 찾기
    let organizer: string | null = null;
    let category: string | null = null;
    let startDate: string | null = null;
    let endDate: string | null = null;

    $('tr, .info-row, dl').each((_, el) => {
      const text = $(el).text();

      if (text.includes('접수기간')) {
        const match = text.match(/(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})/);
        if (match) {
          startDate = match[1];
          endDate = match[2];
        }
      }
      if (text.includes('주최/주관') || text.includes('주최사')) {
        const val = $(el).find('td, dd, .value').first().text().trim();
        if (val) organizer = val;
      }
      if (text.includes('분야')) {
        const val = $(el).find('td, dd, .value').first().text().trim();
        if (val) category = val;
      }
    });

    // 테이블 파싱 실패 시 텍스트 직접 파싱
    if (!endDate) {
      const bodyText = $('body').text();
      const dateMatch = bodyText.match(
        /접수기간[^\d]*(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})/,
      );
      if (dateMatch) {
        startDate = dateMatch[1];
        endDate = dateMatch[2];
      }
    }

    if (!endDate) return null; // 날짜 없으면 저장 불가

    return { title, organizer, category, startDate, endDate, sourceUrl: url };
  }

  private async fetchHtml(url: string): Promise<string> {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; knot-crawler/1.0)' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
    return res.text();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
