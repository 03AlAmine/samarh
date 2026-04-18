declare module 'html2pdf.js' {
  interface Html2PdfOptions {
    margin?: number | number[];
    filename?: string;
    image?: { type: string; quality: number };
    html2canvas?: any;
    jsPDF?: any;
    pagebreak?: { 
      mode: string[]; 
      avoid: string[] | string;
      before?: string | string[];
      after?: string | string[];
    };
  }

  interface Html2PdfInstance {
    set(options: Html2PdfOptions): Html2PdfInstance;
    from(element: Element | string): Html2PdfInstance;
    save(filename?: string): Promise<void>;
    output(type: string, options?: any): Promise<any>;
    toPdf(): any;
    toCanvas(): any;
  }

  function html2pdf(): Html2PdfInstance;
  function html2pdf(element: Element | string, options?: Html2PdfOptions): Html2PdfInstance;

  export default html2pdf;
}