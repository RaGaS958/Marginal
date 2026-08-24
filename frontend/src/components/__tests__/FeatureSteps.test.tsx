import { render, screen, fireEvent, act } from '@testing-library/react';
import { FeatureSteps } from '../FeatureSteps';
import { describe, it, expect } from 'vitest';

describe('FeatureSteps', () => {
  const mockFeatures = [
    { step: '1', title: 'First Feature', content: 'Content for first feature', image: 'image1.jpg' },
    { step: '2', title: 'Second Feature', content: 'Content for second feature', image: 'image2.jpg' },
  ];

  it('renders the title and all steps', () => {
    render(<FeatureSteps title="Test Title" features={mockFeatures} />);
    
    expect(screen.getByText('Test Title')).toBeInTheDocument();
    expect(screen.getByText('First Feature')).toBeInTheDocument();
    expect(screen.getByText('Second Feature')).toBeInTheDocument();
  });

  it('changes the active step when a step is clicked', () => {
    render(<FeatureSteps features={mockFeatures} autoPlayInterval={0} />);
    
    // Initially the first step should be active
    const image = screen.getByRole('img');
    expect(image).toHaveAttribute('src', 'image1.jpg');
    
    // Click the second step
    const secondStep = screen.getByText('Second Feature');
    act(() => {
      fireEvent.click(secondStep);
    });
    
    // The image should update
    expect(screen.getByRole('img')).toHaveAttribute('src', 'image2.jpg');
  });
});
