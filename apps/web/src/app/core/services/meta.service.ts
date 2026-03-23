import { Injectable, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Title, Meta } from '@angular/platform-browser';

export interface SeoData {
  title: string;
  description: string;
  url: string;
  image: string;
  noIndex?: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class MetaService {
  private readonly titleService = inject(Title);
  private readonly meta = inject(Meta);
  private readonly doc = inject(DOCUMENT);

  private GetBaseUrl(): string {
    if (typeof window !== 'undefined') {
      return window.location.origin;
    }
    return '';
  }

  SetMeta(seo: SeoData): void {
    const url = seo.url.startsWith('/') ? this.GetBaseUrl() + seo.url : seo.url;
    this.titleService.setTitle(seo.title);
    this.meta.updateTag({ name: 'title', content: seo.title });
    this.meta.updateTag({ name: 'description', content: seo.description });

    this.meta.updateTag({ name: 'og:title', content: seo.title });
    this.meta.updateTag({ name: 'og:type', content: 'website' });
    this.meta.updateTag({ name: 'og:url', content: url });
    this.meta.updateTag({ name: 'og:title', content: seo.title });
    this.meta.updateTag({ name: 'og:description', content: seo.description });
    this.meta.updateTag({ name: 'og:image', content: seo.image });

    this.meta.updateTag({
      name: 'twitter:card',
      content: 'summary_large_image',
    });
    this.meta.updateTag({ name: 'twitter:url', content: url });
    this.meta.updateTag({ name: 'twitter:title', content: seo.title });
    this.meta.updateTag({
      name: 'twitter:description',
      content: seo.description,
    });
    this.meta.updateTag({ name: 'twitter:image', content: seo.image });
    this.meta.removeTag('name="robots"');
    this.RemoveStructuredData();
    if (seo.noIndex) {
      this.SetNoIndex();
    }
    this.SetCanonical(url);
  }

  SetNoIndex(): void {
    this.meta.updateTag({ name: 'robots', content: 'noindex' });
  }

  SetCanonical(url: string): void {
    const head = this.doc.getElementsByTagName('head')[0];
    let element: HTMLLinkElement | null =
      head.querySelector(`link[rel='canonical']`) || null;

    if (element == null) {
      element = this.doc.createElement('link');
      head.appendChild(element);
    }
    element.setAttribute('rel', 'canonical');
    element.setAttribute('href', url);
  }

  RemoveStructuredData(): void {
    const existingStructuredData = this.doc.querySelectorAll(
      'script[type="application/ld+json"]'
    );
    existingStructuredData.forEach((element: Element) => element.remove());
  }

  AddStructuredData(jsonLD: object): void {
    const head = this.doc.getElementsByTagName('head')[0];
    const script = this.doc.createElement('script');
    script.type = 'application/ld+json';
    head.appendChild(script);
    script.textContent = JSON.stringify(jsonLD);
  }
}
