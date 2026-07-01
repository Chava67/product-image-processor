import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProductService } from './services/product.service';
import { CsvImportComponent } from './components/csv-import/csv-import.component';
import { ProductTableComponent } from './components/product-table/product-table.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, CsvImportComponent, ProductTableComponent],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})
export class AppComponent implements OnInit, OnDestroy {
  products: any[] = [];
  message: string = '';
  isSuccess: boolean = true;
  private intervalId: any;
  searchTerm: string = '';
  statusFilter: string = 'all';
  pollingInterval: any = null;
  constructor(private productService: ProductService) {}

  ngOnInit() {
    this.loadProducts();
    this.intervalId = setInterval(() => this.loadProducts(), 3000);
  }

  ngOnDestroy() {
    if (this.intervalId) clearInterval(this.intervalId);
  }

  loadProducts() {
    this.productService.getProducts().subscribe({
      next: (data) => {
        this.products = data;

        const hasQueuedProducts = this.products.some(
          (p) => p.status === 'queued',
        );

        if (hasQueuedProducts) {
          this.startPolling();
        } else {
          this.stopPolling();
        }
      },
      error: (err: any) => console.error('Failed to load products:', err),
    });
  }

  startPolling() {
    if (this.pollingInterval) return;

    console.log('🔄 Queued products found. Starting live updates...');
    this.pollingInterval = setInterval(() => {
      this.loadProducts();
    }, 3000);
  }

  stopPolling() {
    if (this.pollingInterval) {
      console.log('🛑 All products processed. Stopping live updates.');
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  handleSingleLine(csvLine: string) {
    this.productService.importCsvData(csvLine).subscribe({
      next: (response) => {
        this.loadProducts();
        if (response.skippedUnchanged > 0 && response.processedOrQueued === 0) {
          this.message = `The product (or products) already exists in the system and has not changed, so it was skipped to prevent duplicates.`;
          this.isSuccess = true;
        } else {
          this.message = `✅ Processing completed successfully!
                  Found in file: ${response.totalFoundInCsv} products.
                  Sent for processing: ${response.processedOrQueued} products.
                  Skipped (already exist): ${response.skippedUnchanged} products.`;
          this.isSuccess = true;
        }
      },
      error: (err) => console.error('Single import failed:', err),
    });
  }

  handleBulkFile(file: File) {
    this.productService.importCsvData(file).subscribe({
      next: (res) => {
        this.loadProducts();
      },
      error: (err) => console.error('Bulk file import failed:', err),
    });
  }
  onHandleRetryTriggered(productId: string) {
    this.productService.retryProduct(productId).subscribe({
      next: (response) => {
        console.log(`${response}`);
        debugger;
        this.loadProducts();
      },
      error: (err) => console.error('Retry failed:', err),
    });
  }
}