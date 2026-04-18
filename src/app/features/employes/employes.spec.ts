import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Employes } from './employes';

describe('Employes', () => {
  let component: Employes;
  let fixture: ComponentFixture<Employes>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Employes]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Employes);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
