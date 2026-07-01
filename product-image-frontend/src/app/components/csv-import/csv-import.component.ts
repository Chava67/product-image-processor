import { Component, EventEmitter, Output, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-csv-import',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './csv-import.component.html',
  styleUrls: ['./csv-import.component.css'],
})
export class CsvImportComponent {
  activeTab: 'text' | 'file' = 'text';
  csvInput: string = '';
  selectedFile: File | null = null;

  @Input() message: string = '';
  @Input() isSuccess: boolean = true;

  @Output() textSubmitted = new EventEmitter<string>();
  @Output() fileSubmitted = new EventEmitter<File>();
  submitText() {
    if (this.csvInput.trim()) {
      this.textSubmitted.emit(this.csvInput.trim());
      this.csvInput = '';
    }
  }

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file && (file.type === 'text/csv' || file.name.endsWith('.csv'))) {
      this.selectedFile = file;
    } else {
      alert('Please select a valid CSV file.');
      this.selectedFile = null;
      event.target.value = '';
    }
  }

  submitFile() {
    if (this.selectedFile) {
      this.fileSubmitted.emit(this.selectedFile);
      this.selectedFile = null; 

      const fileInput = document.getElementById(
        'csvFileInput',
      ) as HTMLInputElement;
      if (fileInput) fileInput.value = '';
    }
  }
}
