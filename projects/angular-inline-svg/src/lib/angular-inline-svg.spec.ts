import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AngularInlineSvg } from './angular-inline-svg';

describe('AngularInlineSvg', () => {
  let component: AngularInlineSvg;
  let fixture: ComponentFixture<AngularInlineSvg>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AngularInlineSvg],
    }).compileComponents();

    fixture = TestBed.createComponent(AngularInlineSvg);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
