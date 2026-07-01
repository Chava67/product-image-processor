
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment'; 

@Injectable({
  providedIn: 'root'
})
export class ProductService {
  private apiUrl = `${environment.apiUrl}/products`;

  constructor(private http: HttpClient) {}

importCsvData(payload: string | File): Observable<any> {
  const formData = new FormData();

  if (payload instanceof File) {
    formData.append('csvFile', payload);
  } else {
    formData.append('csvData', payload);
  }

  return this.http.post(`${this.apiUrl}/import`, formData);
}
  getProducts(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrl);
  }
  
  retryProduct(productId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/retry/${productId}`, {});
  }
}