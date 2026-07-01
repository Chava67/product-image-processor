import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-product-table',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './product-table.component.html',
  styleUrls: ['./product-table.component.css']
})
export class ProductTableComponent {
  @Input() products: any[] = [];
  @Output() retryTriggered = new EventEmitter<string>();
  searchTerm: string = '';
  statusFilter: string = 'all';

  onRetryClick(productId: string) {
    this.retryTriggered.emit(productId);
  }
  get filteredProducts() {
    return this.products.filter(prod => {
      const matchesSearch = prod.sku?.toLowerCase().includes(this.searchTerm.toLowerCase()) || 
                            prod.title?.toLowerCase().includes(this.searchTerm.toLowerCase());
      
      const matchesStatus = this.statusFilter === 'all' || prod.status === this.statusFilter;
      
      return matchesSearch && matchesStatus;
    });
 }


  getStatusClass(status: string): string {
    switch (status) {
      case 'processed': return 'badge bg-success';
      case 'processing': return 'badge bg-warning text-dark';
      case 'queued': return 'badge bg-info text-dark';
      case 'failed': return 'badge bg-danger';
      default: return 'badge bg-secondary';
    }
  }
}