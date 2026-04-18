// src/app/features/home/home.ts
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './home.html',
  styleUrls: ['./home.scss']
})
export class HomeComponent implements OnInit {
  // Filtres de recherche rapide
  quickSearchTerm = '';
  selectedLocation = '';
  selectedSchedule = '';
  constructor(private router: Router) {}
  ngOnInit(): void {
    this.animateStats();
  }

  // Recherche rapide
  onQuickSearchChange(term: string): void {
    this.quickSearchTerm = term;
  }

  onLocationChange(location: string): void {
    this.selectedLocation = location;
  }

  onScheduleChange(schedule: string): void {
    this.selectedSchedule = schedule;
  }

  onQuickSearch(): void {
    const queryParams: any = {};
    if (this.quickSearchTerm) queryParams.search = this.quickSearchTerm;
    if (this.selectedLocation) queryParams.location = this.selectedLocation;
    if (this.selectedSchedule) queryParams.schedule = this.selectedSchedule;
    // this.router.navigate(['/courses'], { queryParams });
  }

  // Carousel des cours
  scrollCarousel(direction: number): void {
    const container = document.querySelector('.courses-grid');
    if (container) {
      const scrollAmount = 320;
      container.scrollLeft += direction * scrollAmount;
    }
  }

  // Voir détails d'un cours
  viewCourseDetails(course: any): void {
    // this.router.navigate(['/courses', course.id]);
  }

  // Voir profil d'un enseignant
  viewTeacherProfile(teacher: any): void {
    // this.router.navigate(['/teachers', teacher.id]);
  }

  // Animation des statistiques
  animateStats(): void {
    const statElements = document.querySelectorAll('.stat-number');
    
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const statElement = entry.target as HTMLElement;
          const target = parseInt(statElement.getAttribute('data-count') || '0');
          const duration = 2000;
          const step = target / (duration / 16);
          let current = 0;
          
          const timer = setInterval(() => {
            current += step;
            if (current >= target) {
              current = target;
              clearInterval(timer);
            }
            statElement.textContent = Math.floor(current).toString();
          }, 16);
          
          observer.unobserve(statElement);
        }
      });
    }, { threshold: 0.5 });
    
    statElements.forEach(stat => observer.observe(stat));
  }

  // Gestion des erreurs d'images
  handleImageError(event: any): void {
    event.target.style.display = 'none';
  }
  navigateToRegister(): void {
    this.router.navigate(['/register']);
  }

  navigateToLogin(): void {
    this.router.navigate(['/login']);
  }
}
