import { useState } from 'react';

/**
 * UserPrompt - Displays when an agent needs user input
 * 
 * @param {Object} props
 * @param {string} props.taskId - Current task ID
 * @param {Object} props.interaction - The interaction request
 * @param {string} props.interaction.message - Message from agent
 * @param {boolean} props.interaction.expectResponse - Whether response is expected
 * @param {Array<string>} props.interaction.options - Optional choices
 * @param {string} props.interaction.type - 'question' | 'report' | 'confirmation'
 * @param {Function} props.onRespond - Callback when user responds
 * @param {Function} props.onDismiss - Callback to dismiss (for reports)
 */
function UserPrompt({ taskId, interaction, onRespond, onDismiss }) {
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const { message, expectResponse = true, options = [], type = 'question' } = interaction;
  
  const handleSubmit = async (value) => {
    if (!value && expectResponse) {
      setError('Please provide a response');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      const res = await fetch(`/api/task/${taskId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: value })
      });
      
      if (!res.ok) {
        throw new Error('Failed to send response');
      }
      
      if (onRespond) {
        onRespond(value);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  
  const handleOptionClick = (option) => {
    handleSubmit(option);
  };
  
  const handleTextSubmit = (e) => {
    e.preventDefault();
    handleSubmit(response);
  };
  
  const handleDismiss = () => {
    if (onDismiss) {
      onDismiss();
    }
    // For reports, send acknowledgment
    if (type === 'report' && !expectResponse) {
      handleSubmit('acknowledged');
    }
  };
  
  // Determine icon based on type
  const getIcon = () => {
    switch (type) {
      case 'confirmation':
        return '!';
      case 'report':
        return 'i';
      default:
        return '?';
    }
  };
  
  // Determine title based on type
  const getTitle = () => {
    switch (type) {
      case 'confirmation':
        return 'Confirmation Required';
      case 'report':
        return 'Agent Report';
      default:
        return 'Agent Question';
    }
  };
  
  return (
    <div className="user-prompt-overlay">
      <div className={`user-prompt user-prompt-${type}`}>
        <div className="user-prompt-header">
          <span className={`user-prompt-icon user-prompt-icon-${type}`}>{getIcon()}</span>
          <h3>{getTitle()}</h3>
        </div>
        
        <div className="user-prompt-message">
          {message}
        </div>
        
        {error && (
          <div className="user-prompt-error">
            {error}
          </div>
        )}
        
        {/* Options as buttons */}
        {options.length > 0 && (
          <div className="user-prompt-options">
            {options.map((option, index) => (
              <button
                key={index}
                className="btn btn-option"
                onClick={() => handleOptionClick(option)}
                disabled={loading}
              >
                {option}
              </button>
            ))}
          </div>
        )}
        
        {/* Text input for free-form response */}
        {expectResponse && (
          <form onSubmit={handleTextSubmit} className="user-prompt-form">
            <textarea
              value={response}
              onChange={(e) => setResponse(e.target.value)}
              placeholder={options.length > 0 ? "Or type your own response..." : "Type your response..."}
              disabled={loading}
              rows={3}
            />
            <div className="user-prompt-actions">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={loading || (!response && options.length === 0)}
              >
                {loading ? 'Sending...' : 'Send Response'}
              </button>
            </div>
          </form>
        )}
        
        {/* Dismiss button for reports */}
        {type === 'report' && !expectResponse && (
          <div className="user-prompt-actions">
            <button
              className="btn btn-secondary"
              onClick={handleDismiss}
              disabled={loading}
            >
              Got it
            </button>
          </div>
        )}
        
        {/* Confirmation buttons */}
        {type === 'confirmation' && options.length === 0 && (
          <div className="user-prompt-actions">
            <button
              className="btn btn-secondary"
              onClick={() => handleSubmit('no')}
              disabled={loading}
            >
              No
            </button>
            <button
              className="btn btn-primary"
              onClick={() => handleSubmit('yes')}
              disabled={loading}
            >
              Yes
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default UserPrompt;
