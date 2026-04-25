import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Statistiques } from './statistiques';

describe('Statistiques', () => {
  let component: Statistiques;
  let fixture: ComponentFixture<Statistiques>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Statistiques]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Statistiques);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
