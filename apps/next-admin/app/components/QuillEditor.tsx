'use client';
import ReactQuill, { Quill } from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';

// Register custom inline font sizes so that Quill uses `style="font-size: 16px"`
// instead of CSS classes like `class="ql-size-large"`
const Size: any = Quill.import('attributors/style/size');
Size.whitelist = ['10px', '12px', '14px', '16px', '18px', '20px', '24px', '32px'];
Quill.register(Size, true);

const Font: any = Quill.import('attributors/style/font');
Font.whitelist = ['sans-serif', 'serif', 'monospace', 'arial', 'courier', 'garamond', 'tahoma', 'times', 'verdana'];
Quill.register(Font, true);

const InlineEmbed: any = Quill.import('blots/embed');

class ImageBlot extends InlineEmbed {
  static blotName = 'image';
  static tagName = 'IMG';

  static create(value: any) {
    const node = super.create() as HTMLImageElement;
    if (typeof value === 'string') {
      node.setAttribute('src', value);
    } else {
      node.setAttribute('src', value.src || value.url || '');
      if (value.alt) node.setAttribute('alt', value.alt);
      if (value.width) node.setAttribute('width', value.width);
      if (value.style) node.setAttribute('style', value.style);
    }
    node.setAttribute('data-image-blot', 'true');
    return node;
  }

  static value(node: HTMLImageElement) {
    return {
      src: node.getAttribute('src') || '',
      alt: node.getAttribute('alt') || '',
      width: node.getAttribute('width') || '',
      style: node.getAttribute('style') || '',
    };
  }

  static formats(node: HTMLImageElement) {
    const formats: any = {};
    if (node.hasAttribute('alt')) formats.alt = node.getAttribute('alt');
    if (node.hasAttribute('width')) formats.width = node.getAttribute('width');
    if (node.hasAttribute('style')) formats.style = node.getAttribute('style');
    return formats;
  }

  format(name: string, value: any) {
    if (['alt', 'width', 'style'].includes(name)) {
      if (value) {
        (this as any).domNode.setAttribute(name, value);
      } else {
        (this as any).domNode.removeAttribute(name);
      }
    } else {
      super.format(name, value);
    }
  }
}

Quill.register(ImageBlot, true);

// ── Custom Link Blot ─────────────────────────────────────────────────
// Quill's default Link format strips all attributes except href/target.
// For HTML emails, we need inline `style` on <a> tags (e.g. color for
// dark backgrounds) to survive the editor's sanitization. This custom
// blot preserves the style attribute through the Quill format pipeline.
const InlineBlot: any = Quill.import('blots/inline');

class LinkBlot extends InlineBlot {
  static blotName = 'link';
  static tagName = 'A';

  static create(value: any) {
    const node = super.create() as HTMLAnchorElement;
    if (typeof value === 'string') {
      node.setAttribute('href', value);
    } else {
      node.setAttribute('href', value.href || value);
      if (value.style) node.setAttribute('style', value.style);
    }
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
    return node;
  }

  static formats(node: HTMLAnchorElement) {
    const href = node.getAttribute('href') || '';
    const style = node.getAttribute('style') || '';
    if (style) {
      return { href, style };
    }
    return href;
  }

  static value(node: HTMLAnchorElement) {
    return node.getAttribute('href') || '';
  }

  format(name: string, value: any) {
    if (name === 'link') {
      if (value) {
        if (typeof value === 'string') {
          (this as any).domNode.setAttribute('href', value);
        } else {
          (this as any).domNode.setAttribute('href', value.href || value);
          if (value.style) {
            (this as any).domNode.setAttribute('style', value.style);
          }
        }
      } else {
        // Remove link: unwrap the blot
        (this as any).domNode.removeAttribute('href');
      }
    } else if (name === 'style') {
      if (value) {
        (this as any).domNode.setAttribute('style', value);
      } else {
        (this as any).domNode.removeAttribute('style');
      }
    } else {
      super.format(name, value);
    }
  }
}

Quill.register(LinkBlot, true);

// ── Table Module ──────────────────────────────────────────────────────
// Quill 2.0 ships with a dedicated Table module (modules/table.js) that
// uses proper Delta operations. Its static register() method auto-registers
// TableCell, TableRow, TableBody, and TableContainer formats.
// We import and register the module so it's available when `table: true`
// is set in the Quill config.
const TableModule: any = Quill.import('modules/table');
if (TableModule) {
  Quill.register('modules/table', TableModule, true);
}

export default function QuillEditor(props: any) {
  return <ReactQuill {...props} />;
}
