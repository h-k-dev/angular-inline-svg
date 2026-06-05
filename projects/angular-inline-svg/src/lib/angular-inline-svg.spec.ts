<<<<<<< HEAD
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { AngularInlineSvg } from './angular-inline-svg';

@Component({
  imports: [AngularInlineSvg],
  template: `<span [inlineSVG]="url"></span>`,
})
class HostComponent {
  url = 'assets/media/fish.svg';
}

describe('InlineSvg', () => {
  let fixture: ComponentFixture<HostComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HostComponent] });
    fixture = TestBed.createComponent(HostComponent);
  });

  it('should create the directive on its host element', () => {
    fixture.detectChanges();

    const host = fixture.debugElement.query(By.directive(AngularInlineSvg));
    expect(host).toBeTruthy();
    expect(host.injector.get(AngularInlineSvg)).toBeTruthy();
=======
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
>>>>>>> main
  });
});
