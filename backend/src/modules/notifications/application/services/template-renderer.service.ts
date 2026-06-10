import { Injectable } from '@nestjs/common';

@Injectable()
export class TemplateRendererService {
  /**
   * Replaces {{variable}} placeholders in a template string.
   */
  render(template: string, variables: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
      return variables[key] ?? '';
    });
  }
}
